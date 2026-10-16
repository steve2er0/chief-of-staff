"""Local artifact boundaries and native measurements; no external services."""
import copy
import ctypes
import http.client
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from urllib.parse import quote

import test_agent_manager
import test_app
from cos.artifacts import PREVIEW_LIMIT, image_type, relative_reference, reveal_file, reveal_reference
from cos.metrics import HostMetrics, _linux, _mac, _windows, context_usage
from cos.progress import apply_progress
from cos.safety import Invalid
from cos.server import LocalServer
from cos.service import Service
from cos.store import uid


PNG = b'\x89PNG\r\n\x1a\n' + b'fixture raster bytes'


class BackendFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.work = self.root / 'work'
        self.work.mkdir()
        self.s = Service(self.root / 'data', adapter=test_app.FakeAdapter(), start=False)
        self.p = self.s.project({'cwd': str(self.work)})
        plan = self.s.start_agents({'project_id': self.p['id'], 'agents': [{'instructions': 'Inspect fixtures'}], 'isolate': False})
        self.task = self.s.store.get('task', plan['task_ids'][0])
        self.task.update(state='ready_for_review', conversation=[], result=copy.deepcopy(test_app.GOOD))
        self.save()

    def tearDown(self):
        self.s.close()
        self.tmp.cleanup()

    def save(self):
        self.s.store.put('task', self.task)

    def file(self, name, data=b'fixture'):
        path = self.work / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def output(self, name='artifact-00.txt', source='docs/chart.png', data=PNG):
        path = self.s.data / 'outputs' / self.task['id'] / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        self.task['output_links'].append({'name': name, 'source_path': source})
        self.save()
        return path


class ArtifactTests(BackendFixture):
    def test_only_explicit_agent_references_are_task_scoped(self):
        chart = self.file('docs/chart.png', PNG)
        notes = self.file('notes.txt')
        self.task['conversation'] = [
            {'role': 'user', 'text': '[private](notes.txt)'},
            {'role': 'assistant', 'text': '[chart](<' + str(chart) + ':12:2>)'}]
        self.task['result']['summary'] = 'Plain mention notes.txt is not a file link.'
        self.save()
        self.assertEqual(self.s.artifact(self.task['id'], 'docs/chart.png'), chart)
        with self.assertRaises(Invalid):
            self.s.artifact(self.task['id'], notes.name)
        other = copy.deepcopy(self.task)
        other.update(id=uid(), conversation=[], output_links=[], result=copy.deepcopy(test_app.GOOD))
        self.s.store.put('task', other)
        with self.assertRaises(Invalid):
            self.s.artifact(other['id'], 'docs/chart.png')

    def test_result_inline_paths_and_registered_sources_are_supported(self):
        for name in ('declared.txt', 'inline.txt', 'source.txt'):
            self.file(name)
        self.task['result'].update(artifacts=['declared.txt'], agent_report='Saved `inline.txt:3`.')
        self.output(source='source.txt')
        self.save()
        for name in ('declared.txt', 'inline.txt', 'source.txt'):
            self.assertEqual(self.s.artifact(self.task['id'], name), self.work / name)

    def test_traversal_network_device_paths_and_symlinks_are_rejected(self):
        outside = self.root / 'private.txt'
        outside.write_text('private')
        self.file('safe.txt')
        (self.work / 'alias.txt').symlink_to(outside)
        (self.work / 'alias-dir').symlink_to(self.root, target_is_directory=True)
        unsafe = ['../private.txt', '..\\private.txt', str(outside), '//server/share',
                  'C:\\private.txt', 'safe.txt:stream', 'a//b', 'a/./b', 'alias.txt', 'alias-dir/private.txt']
        self.task['result']['artifacts'] = unsafe + ['missing.txt']
        self.save()
        for value in unsafe + ['missing.txt']:
            with self.subTest(value=value), self.assertRaises(Invalid):
                self.s.artifact(self.task['id'], value)

    def test_changed_cwd_symlink_cannot_expose_original_artifacts(self):
        self.file('docs/chart.png', PNG)
        self.task['result']['artifacts'] = ['docs/chart.png']
        snapshot = self.output()
        moved = self.root / 'moved'
        self.work.rename(moved)
        self.work.symlink_to(moved, target_is_directory=True)
        with self.assertRaises(Invalid):
            relative_reference(str(self.work), 'docs/chart.png')
        with self.assertRaises(Invalid):
            self.s.artifact(self.task['id'], 'docs/chart.png')
        with patch('cos.artifacts.reveal_file', return_value={'revealed': True}) as reveal:
            result = self.s.reveal_artifact(self.task['id'], name=snapshot.name)
        reveal.assert_called_once_with(snapshot)
        self.assertEqual(result['location'], 'saved snapshot')

    def test_reveal_prefers_valid_original_then_uses_snapshot(self):
        original = self.file('docs/chart.png', PNG)
        snapshot = self.output()
        with patch('cos.artifacts.reveal_file', return_value={'revealed': True}) as reveal:
            result = self.s.reveal_artifact(self.task['id'], name=snapshot.name)
            reveal.assert_called_once_with(original)
            self.assertEqual(result['location'], 'project')
            original.unlink()
            reveal.reset_mock()
            result = self.s.reveal_artifact(self.task['id'], name=snapshot.name)
            reveal.assert_called_once_with(snapshot)
            self.assertEqual(result['location'], 'saved snapshot')
            with self.assertRaises(Invalid):
                self.s.reveal_artifact(self.task['id'], name='unregistered.txt')

    def test_reveal_commands_are_native_argument_vectors(self):
        path = Path('/tmp/report; $(do-not-run).png')
        for platform, command in [('darwin', ['/usr/bin/open', '-R', str(path)]),
                                  ('win32', ['explorer.exe', '/select,' + str(path)])]:
            runner = Mock()
            self.assertTrue(reveal_file(path, platform, runner)['revealed'])
            runner.assert_called_once_with(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                           stderr=subprocess.DEVNULL, shell=False)
        self.assertFalse(reveal_file(path, 'linux', Mock())['revealed'])
        self.assertFalse(reveal_file(path, 'darwin', Mock(side_effect=OSError()))['revealed'])

    def test_reveal_directory_opens_contents_and_file_selects_in_parent(self):
        folder = self.work / 'plots'
        folder.mkdir()
        for platform, command in [('darwin', ['/usr/bin/open', str(folder)]),
                                  ('win32', ['explorer.exe', str(folder)])]:
            runner = Mock()
            self.assertTrue(reveal_file(folder, platform, runner)['revealed'])
            self.assertEqual(runner.call_args.args[0], command)
            self.assertFalse(runner.call_args.kwargs['shell'])

    def test_reveal_accepts_explicit_files_and_directories_inside_run_folder(self):
        file = self.file('docs/chart.png', PNG)
        values = [self.work.name, '.', str(self.work), 'docs/', str(self.work/'docs')+'/',
                  'docs/chart.png', str(file)+':12']
        self.task['result']['artifacts'] = values
        self.save()
        for value, target in zip(values, [self.work,self.work,self.work,file.parent,file.parent,file,file]):
            with self.subTest(value=value), patch('cos.artifacts.reveal_file', return_value={'revealed': True}) as reveal:
                result = self.s.reveal_artifact(self.task['id'], relative=value)
                reveal.assert_called_once_with(target)
                self.assertEqual(result['path'], str(target))
                self.assertEqual(result['kind'], 'directory' if target.is_dir() else 'file')
        with self.assertRaises(Invalid):
            self.s.artifact(self.task['id'], 'docs')  # Reveal does not enable directory downloads.

    def test_original_checkout_requires_captured_root_and_explicit_reference(self):
        source = self.root / 'original-project'
        source.mkdir()
        file = source / 'updated.txt'
        file.write_text('synthetic')
        self.task['worktree'] = {'source_cwd': str(source), 'path': str(self.work)}
        self.task['conversation'] = [{'role': 'assistant', 'text': f'Updated `{source.name}`, [{file.name}]({file}).'}]
        self.save()
        for value, target in [(source.name,source), (str(file),file)]:
            with self.subTest(value=value), patch('cos.artifacts.reveal_file', return_value={'revealed': True}) as reveal:
                result = self.s.reveal_artifact(self.task['id'], relative=value)
                reveal.assert_called_once_with(target)
                self.assertEqual(result['location'], 'original project folder')
        with self.assertRaises(Invalid):
            self.s.reveal_artifact(self.task['id'], relative=str(source))  # Root was not declared absolutely.
        with self.assertRaises(Invalid):
            self.s.artifact(self.task['id'], str(file))  # Preview/download roots are unchanged.
        self.task['result']['artifacts'] = ['updated.txt']
        self.save()
        with self.assertRaisesRegex(Invalid, 'missing'):
            self.s.reveal_artifact(self.task['id'], relative='updated.txt')  # Never search the other checkout.
        del self.task['worktree']
        self.save()
        with self.assertRaises(Invalid):
            self.s.reveal_artifact(self.task['id'], relative=str(file))

    def test_reveal_rejects_missing_unreferenced_and_outside_paths(self):
        outside = self.root / 'outside.txt'
        outside.write_text('private synthetic')
        self.file('known.txt')
        self.task['result']['artifacts'] = ['missing.txt', '../outside.txt', str(outside),
                                          'docs/../known.txt', '//host/private', 'C:\\private.txt']
        self.save()
        for value in self.task['result']['artifacts'] + ['known.txt']:
            with self.subTest(value=value), patch('cos.artifacts.reveal_file') as reveal, self.assertRaises(Invalid):
                self.s.reveal_artifact(self.task['id'], relative=value)
            reveal.assert_not_called()

    def test_reveal_rejects_symlink_children_and_changed_original_root(self):
        source = self.root / 'original'
        source.mkdir()
        outside = self.root / 'outside'
        outside.mkdir()
        (self.work/'alias').symlink_to(outside, target_is_directory=True)
        self.task['worktree'] = {'source_cwd': str(source)}
        self.task['result']['artifacts'] = ['alias', source.name]
        self.save()
        with self.assertRaises(Invalid):
            self.s.reveal_artifact(self.task['id'], relative='alias')
        source.rmdir()
        source.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(Invalid):
            self.s.reveal_artifact(self.task['id'], relative=source.name)

    def test_ambiguous_folder_basename_needs_an_absolute_reference(self):
        other = self.root / 'other' / self.work.name
        other.mkdir(parents=True)
        self.task['worktree'] = {'source_cwd': str(other)}
        with self.assertRaisesRegex(Invalid, 'ambiguous'):
            reveal_reference(self.task, self.work.name)
        self.assertEqual(reveal_reference(self.task, str(other))[0], other)

    def test_reveal_failure_returns_copyable_verified_path_without_download(self):
        path = self.file('notes.txt')
        self.task['result']['artifacts'] = ['notes.txt']
        self.save()
        with patch('cos.artifacts.sys.platform', 'linux'):
            result = self.s.reveal_artifact(self.task['id'], relative='notes.txt')
        self.assertFalse(result['revealed'])
        self.assertEqual(result['path'], str(path))
        self.assertIn('Copy', result['reason'])
        self.assertNotIn('download', result['reason'].lower())

    def test_raster_previews_use_bytes_and_enforce_size(self):
        for payload, kind in [(PNG, 'image/png'), (b'\xff\xd8\xfffixture', 'image/jpeg'),
                              (b'GIF89afixture', 'image/gif'), (b'GIF87afixture', 'image/gif'),
                              (b'RIFF1234WEBPfixture', 'image/webp')]:
            with self.subTest(kind=kind):
                self.assertEqual(image_type(self.file('image.txt', payload)), kind)
        for payload in (b'<svg onload="alert(1)"/>', b'<html>script</html>', b'%PDF-1.7', b'RIFF1234WAVE'):
            with self.subTest(payload=payload), self.assertRaises(Invalid):
                image_type(self.file('image.png', payload))
        large = self.file('large.png', PNG)
        with large.open('r+b') as stream:
            stream.truncate(PREVIEW_LIMIT + 1)
        with self.assertRaises(Invalid):
            image_type(large)


class ProjectAndContextTests(BackendFixture):
    def test_cwd_only_project_infers_name_without_losing_existing_metadata(self):
        self.assertEqual(self.p['name'], self.work.name)
        self.assertEqual(self.p['vision'], 'Work in work.')
        self.assertFalse(self.p['demo_directory'])
        self.assertEqual(self.p['cwd'], str(self.work))
        saved = self.s.project({'name': 'Custom name', 'vision': 'Keep a custom goal',
                                'next_steps': 'Review charts', 'priority': 'advance'}, self.p['id'])
        other = self.root / 'other'
        other.mkdir()
        updated = self.s.project({'cwd': str(other)}, saved['id'])
        for key in ('name', 'vision', 'goal', 'next_steps', 'priority', 'vision_history', 'created'):
            self.assertEqual(updated[key], saved[key])
        self.assertEqual(updated['cwd'], str(other))

    def test_new_continuations_do_not_copy_old_context_measurements(self):
        usage = context_usage({'last': {'totalTokens': 80}, 'modelContextWindow': 1000}, 'then')
        for fresh in (False, True):
            with self.subTest(fresh=fresh):
                task = copy.deepcopy(self.task)
                task.update(id=uid(), session_id=test_app.SID, context_usage=usage)
                self.s.store.put('task', task)
                next_task = self.s.reply_agent(task['id'], 'Continue checking', fresh=fresh)
                self.assertNotIn('context_usage', next_task)
                self.assertEqual(self.s.store.get('task', task['id'])['context_usage'], usage)
                self.assertEqual(next_task['session_id'], None if fresh else test_app.SID)

    def test_native_last_request_usage_has_provenance_and_never_uses_cumulative_tokens(self):
        raw = {'last': {'totalTokens': 120}, 'total': {'totalTokens': 9000}, 'modelContextWindow': 1000}
        usage = context_usage(raw, 'now')
        self.assertEqual((usage['used_tokens'], usage['percent']), (120, 12.0))
        self.assertEqual((usage['source'], usage['basis'], usage['updated_at']),
                         ('codex_app_server', 'last_model_request', 'now'))
        record = {'history': [], 'latest_update': 'Reading notes'}
        apply_progress(record, {'token_usage': raw}, 'now')
        self.assertEqual(record['context_usage'], usage)
        self.assertEqual(record['latest_update'], 'Reading notes')
        unknown = context_usage({'last': {'totalTokens': 20}}, 'now')
        self.assertFalse(unknown['available'])
        self.assertIsNone(unknown['percent'])

    def test_invalid_context_usage_is_not_presented_as_a_measurement(self):
        for value in (None, {}, {'total': {'totalTokens': 100}}, {'last': {'totalTokens': True}},
                      {'last': {'totalTokens': -1}}, {'last': {'totalTokens': '100'}},
                      {'last': {'totalTokens': 10}, 'modelContextWindow': 0},
                      {'last': {'totalTokens': 10}, 'modelContextWindow': True}):
            with self.subTest(value=value):
                self.assertIsNone(context_usage(value, 'now'))
                record = {}
                apply_progress(record, {'token_usage': value}, 'now')
                self.assertNotIn('context_usage', record)

    def test_snapshot_exposes_cached_host_measurements(self):
        reader = Mock(return_value=(100, 25, 30, 100))
        self.s.host_metrics = HostMetrics(reader=reader)
        first, second = self.s.snapshot(), self.s.snapshot()
        self.assertEqual(first['host_metrics']['memory_percent'], 30.0)
        self.assertEqual(first['host_metrics'], second['host_metrics'])
        reader.assert_called_once()

    def test_native_usage_persists_to_selected_agent_snapshot_without_a_limit(self):
        self.task['state'] = 'running'
        self.save()
        raw = {'last': {'totalTokens': 120, 'inputTokens': 100, 'outputTokens': 20},
               'total': {'totalTokens': 9000}, 'modelContextWindow': None}
        self.s._update(self.task['id'], {'token_usage': raw})
        saved = self.s.store.get('task', self.task['id'])['context_usage']
        self.assertEqual(saved['used_tokens'], 120)
        self.assertIsNone(saved['max_tokens'])
        self.assertIsNone(saved['percent'])
        self.assertFalse(saved['available'])  # Only the percentage is unavailable.
        shown = next(t for t in self.s.snapshot()['tasks'] if t['id'] == self.task['id'])
        self.assertEqual(shown['context_usage'], saved)
        self.s._update(self.task['id'], {'token_usage': {'total': {'totalTokens': 9500}}})
        self.assertEqual(self.s.store.get('task', self.task['id'])['context_usage'], saved)


class MetricsTests(unittest.TestCase):
    def test_cache_limits_native_calls_and_cpu_uses_sample_deltas(self):
        clock = [0]
        reader = Mock(side_effect=[(1000, 250, 25, 100), (1200, 300, 50, 100)])
        metrics = HostMetrics(reader=reader, clock=lambda: clock[0])
        first = metrics.snapshot()
        self.assertIsNone(first['cpu_percent'])
        self.assertEqual(first['memory_percent'], 25)
        first['memory_percent'] = -1
        clock[0] = 4.9
        self.assertEqual(metrics.snapshot()['memory_percent'], 25)
        self.assertEqual(reader.call_count, 1)
        clock[0] = 5
        second = metrics.snapshot()
        self.assertEqual((second['cpu_percent'], second['memory_percent']), (75, 50))
        self.assertEqual(second['scope'], 'app_host')
        self.assertEqual(reader.call_count, 2)

    def test_unavailable_or_invalid_readings_reset_cpu_baseline(self):
        for invalid in (OSError(), (10, 20, 3, 10), (10, 2, 11, 10), (10, 2, 0, 0)):
            with self.subTest(invalid=invalid):
                reader = Mock(side_effect=[(100, 25, 20, 100), invalid, (300, 80, 40, 100)])
                metrics = HostMetrics(interval=0, reader=reader)
                self.assertTrue(metrics.snapshot()['available'])
                unavailable = metrics.snapshot()
                self.assertFalse(unavailable['available'])
                self.assertIsNone(unavailable['memory_percent'])
                self.assertIsNone(unavailable['cpu_percent'])
                self.assertIsNone(metrics.snapshot()['cpu_percent'])
        self.assertFalse(HostMetrics(platform='unsupported').snapshot()['available'])

    def test_windows_dispatch_reads_native_structs_and_64_bit_cpu_ticks(self):
        class Kernel:
            def GetSystemTimes(self, idle, kernel, user):
                idle._obj.dwHighDateTime, idle._obj.dwLowDateTime = 1, 20
                kernel._obj.dwHighDateTime, kernel._obj.dwLowDateTime = 2, 30
                user._obj.dwHighDateTime, user._obj.dwLowDateTime = 1, 10
                return 1

            def GlobalMemoryStatusEx(self, memory):
                self.memory_size = memory._obj.length
                memory._obj.total, memory._obj.available = 16 * 1024**3, 4 * 1024**3
                return 1

        kernel = Kernel()
        total, idle, used, capacity = _windows(kernel)
        self.assertEqual((total, idle), ((3 << 32) + 40, (1 << 32) + 20))
        self.assertEqual((used, capacity, kernel.memory_size), (12 * 1024**3, 16 * 1024**3, 64))
        with patch('cos.metrics.ctypes.WinDLL', create=True, return_value=kernel) as load:
            sample = HostMetrics(platform='win32').snapshot()
        load.assert_called_once_with('kernel32', use_last_error=True)
        self.assertTrue(sample['available'])
        self.assertEqual(sample['memory_percent'], 75)
        failing = Mock()
        failing.GetSystemTimes.return_value = 0
        with self.assertRaises(OSError):
            _windows(failing)
        failing.GlobalMemoryStatusEx.assert_not_called()

    def test_mac_native_api_layout_and_port_cleanup(self):
        class Lib:
            def mach_host_self(self): return 17
            def mach_task_self(self): return 19
            def host_statistics(self, host, flavor, values, count):
                if flavor == 3:
                    values[:] = [10, 20, 30, 40]
                else:
                    values[0], values[14] = 2, 1
                return 0
            def sysctlbyname(self, name, total, size, unused, length):
                total._obj.value = 100 * 4096
                return 0
            def host_page_size(self, host, size):
                self.page_type = type(size._obj)
                size._obj.value = 4096
                return 0
            def mach_port_deallocate(self, task, host):
                self.deallocated = task, host

        lib = Lib()
        self.assertEqual(_mac(lib), (100, 30, 97 * 4096, 100 * 4096))
        self.assertIs(lib.page_type, ctypes.c_size_t)
        self.assertEqual(lib.deallocated, (19, 17))
        lib.host_statistics = Mock(return_value=1)
        lib.deallocated = None
        with self.assertRaises(OSError):
            _mac(lib)
        self.assertEqual(lib.deallocated, (19, 17))
        with patch('cos.metrics._mac', return_value=(100, 20, 60, 100)) as native:
            self.assertEqual(HostMetrics(platform='darwin').snapshot()['memory_percent'], 60)
        native.assert_called_once()

    @unittest.skipUnless(sys.platform == 'darwin', 'Direct native check requires macOS')
    def test_mac_direct_native_measurement(self):
        total, idle, used, capacity = _mac()
        self.assertGreater(total, 0)
        self.assertTrue(0 <= idle <= total)
        self.assertTrue(0 <= used <= capacity)
        self.assertGreater(capacity, 0)

    def test_linux_uses_proc_counters_without_a_process(self):
        def read(path):
            if str(path) == '/proc/stat':
                return 'cpu  10 20 30 40 5 6 7 8 100 200\n'
            return 'MemTotal: 100 kB\nMemAvailable: 25 kB\n'
        with patch('cos.metrics.Path.read_text', read):
            self.assertEqual(_linux(), (126, 45, 75 * 1024, 100 * 1024))


class ContextTransportTests(unittest.TestCase):
    setUp = test_agent_manager.LiveTransportTests.setUp
    tearDown = test_agent_manager.LiveTransportTests.tearDown
    run_fixture = test_agent_manager.LiveTransportTests.run_fixture

    def test_native_token_usage_is_limited_to_the_current_turn(self):
        injection = """def finish(text):
 notify('thread/tokenUsage/updated',{'turnId':'other-turn','tokenUsage':{'last':{'totalTokens':999},'modelContextWindow':1000}})
 notify('thread/tokenUsage/updated',{'turnId':TURN,'tokenUsage':{'last':{'totalTokens':120},'total':{'totalTokens':9999},'modelContextWindow':1000}})
"""
        self.fixture.write_text(test_agent_manager.FIXTURE.replace('def finish(text):\n', injection))
        result = self.run_fixture('prose')
        self.assertEqual(result['status'], 'completed')
        usage = [value['token_usage'] for value in self.updates if 'token_usage' in value]
        self.assertEqual(len(usage), 1)
        self.assertEqual(usage[0]['last']['totalTokens'], 120)


class ArtifactHTTPTests(BackendFixture):
    def setUp(self):
        super().setUp()
        self.file('docs/chart.png', PNG)
        self.output()
        self.server = LocalServer(0, self.s)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        super().tearDown()

    def request(self, path, body=None, auth=True, origin=True, csrf=True, request_id=None):
        headers = {'Cookie': 'cos_session=' + self.server.token} if auth else {}
        if body is not None:
            headers.update({'Content-Type': 'application/json', 'Origin': self.server.origin if origin else 'http://evil.invalid'})
            if csrf:
                headers['X-CoS-CSRF'] = self.server.csrf
            body = json.dumps(dict(body, request_id=request_id or uid()))
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        connection.request('POST' if body is not None else 'GET', path, body, headers)
        response = connection.getresponse()
        result = response.status, response.read(), dict(response.getheaders())
        connection.close()
        return result

    def artifact_url(self, relative='docs/chart.png'):
        return '/api/artifact/' + self.task['id'] + '/' + quote(relative, safe='')

    def test_private_download_and_inline_raster_routes_have_safe_headers(self):
        url = self.artifact_url()
        self.assertEqual(self.request(url, auth=False)[0], 401)
        status, data, headers = self.request(url)
        self.assertEqual((status, data), (200, PNG))
        self.assertEqual(headers['Content-Type'], 'application/octet-stream')
        self.assertTrue(headers['Content-Disposition'].startswith('attachment;'))
        status, data, headers = self.request(url + '?preview=1')
        self.assertEqual((status, data), (200, PNG))
        self.assertEqual(headers['Content-Type'], 'image/png')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn("default-src 'none'", headers['Content-Security-Policy'])
        snapshot = '/api/output-preview/' + self.task['id'] + '/artifact-00.txt'
        self.assertEqual(self.request(snapshot, auth=False)[0], 401)
        self.assertEqual(self.request(snapshot)[2]['Content-Type'], 'image/png')
        download = '/api/output/' + self.task['id'] + '/artifact-00.txt'
        self.assertIn('filename="chart.png"', self.request(download)[2]['Content-Disposition'])

    def test_preview_rejects_active_formats_and_oversized_files_but_download_works(self):
        for name, payload in [('active.svg', b'<svg/>'), ('page.html', b'<html/>')]:
            self.file(name, payload)
            self.task['result']['artifacts'].append(name)
            self.save()
            self.assertEqual(self.request(self.artifact_url(name) + '?preview=1')[0], 400)
            self.assertEqual(self.request(self.artifact_url(name))[1], payload)
        self.output('active.txt', 'active.svg', b'<svg/>')
        self.assertEqual(self.request('/api/output-preview/' + self.task['id'] + '/active.txt')[0], 400)
        large = self.file('large.png', PNG)
        with large.open('r+b') as stream:
            stream.truncate(PREVIEW_LIMIT + 1)
        self.task['result']['artifacts'].append('large.png')
        self.save()
        self.assertEqual(self.request(self.artifact_url('large.png') + '?preview=1')[0], 400)

    def test_encoded_traversal_and_symlink_routes_are_rejected(self):
        (self.work / 'alias.png').symlink_to(self.work / 'docs/chart.png')
        self.task['result']['artifacts'] = ['../private.txt', 'alias.png']
        self.save()
        for relative in ('../private.txt', 'alias.png', 'unreferenced.txt'):
            self.assertEqual(self.request(self.artifact_url(relative))[0], 400)
        self.assertEqual(self.request('/api/output/' + self.task['id'] + '/..%2Fprivate.txt')[0], 400)

    def test_reveal_requires_explicit_private_csrf_post_and_is_idempotent(self):
        body = {'id': self.task['id'], 'name': 'artifact-00.txt'}
        with patch('cos.artifacts.reveal_file', return_value={'revealed': True}) as reveal:
            self.assertEqual(self.request('/api/reveal-artifact')[0], 404)
            self.assertEqual(self.request('/api/reveal-artifact', body, auth=False)[0], 401)
            self.assertEqual(self.request('/api/reveal-artifact', body, origin=False)[0], 403)
            self.assertEqual(self.request('/api/reveal-artifact', body, csrf=False)[0], 403)
            reveal.assert_not_called()
            request_id = uid()
            first = self.request('/api/reveal-artifact', body, request_id=request_id)
            self.assertEqual(first[0], 200)
            self.assertEqual(first[1], self.request('/api/reveal-artifact', body, request_id=request_id)[1])
            reveal.assert_called_once_with(self.work / 'docs/chart.png')


if __name__ == '__main__':
    unittest.main()
