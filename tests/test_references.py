"""Selected local files are immutable project inputs, never delegation approval."""
import copy
import json
from pathlib import Path
import tempfile
import time
import unittest

from cos.safety import Invalid, digest
from cos.service import Service
from test_app import FakeAdapter


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.s = Service(self.root / 'data', start=False)
        self.payload = b'Synthetic source notes\n'
        self.ref = self.s.import_reference('reference notes.txt', self.payload)

    def tearDown(self):
        self.s.close()
        self.tmp.cleanup()

    def project(self, **extra):
        return self.s.project(dict(vision='Review a synthetic reference', reference_ids=[self.ref['id']], **extra))

    def plan(self, project):
        return self.s.plan(project['id'], 'Inspect the selected reference', 'Synthetic input')

    def test_selection_needs_no_working_directory_and_survives_restart(self):
        p = self.project()
        self.assertTrue(p['demo_directory'])
        self.assertEqual(p['reference_files'], [self.ref])
        self.assertEqual(self.ref['sha256'], digest(self.payload))
        self.assertNotIn('path', self.ref)
        self.assertFalse(self.s.store.all('task'))
        self.assertFalse(self.s.store.all('plan'))
        self.s.close()
        self.s = Service(self.root / 'data', start=False)
        self.assertEqual(self.s.store.get('project', p['id'])['reference_files'], [self.ref])
        self.assertEqual(self.s.reference_file(self.ref['id']).read_bytes(), self.payload)

    def test_original_remains_independent_and_not_changed(self):
        original = self.root / 'original.txt'
        original.write_bytes(self.payload)
        ref = self.s.import_reference(original.name, original.read_bytes())
        self.assertEqual(original.read_bytes(), self.payload)
        original.write_bytes(b'Later owner revision')
        self.assertEqual(self.s.reference_file(ref['id']).read_bytes(), self.payload)

    def test_names_and_sizes_cannot_be_used_as_storage_paths(self):
        for name in ['', '.', '..', '../notes.txt', 'folder/notes.txt', 'C:\\notes.txt', 'folder\\notes.txt', 'bad\r\nname', 'x'*256]:
            with self.subTest(name=name), self.assertRaises(Invalid):
                self.s.import_reference(name, self.payload)
        with self.assertRaises(Invalid):
            self.s.import_reference('huge.bin', b'x' * (8*1024*1024+1))
        with self.assertRaises(Invalid):
            self.s.import_reference('notes.txt', 'not bytes')
        weird = self.s.import_reference('référence <sample>.txt', self.payload)
        self.assertEqual(self.s.reference_file(weird['id']).name, 'source.txt')
        self.assertEqual(len(self.s.store.all('reference')), 2)

    def test_cancel_discards_only_unsaved_copies(self):
        path = self.s.reference_file(self.ref['id'])
        self.assertTrue(self.s.discard_reference(self.ref['id'])['discarded'])
        self.assertFalse(path.exists())
        self.assertFalse(self.s.store.all('reference'))
        saved = self.s.import_reference('saved.txt', self.payload)
        self.s.project({'vision': 'Keep a saved reference', 'reference_ids': [saved['id']]})
        with self.assertRaises(Invalid):
            self.s.discard_reference(saved['id'])
        self.assertTrue(self.s.reference_file(saved['id']).is_file())

    def test_copies_cannot_be_bound_to_another_project(self):
        self.project()
        with self.assertRaises(Invalid):
            self.project()
        self.assertEqual(len(self.s.store.all('project')), 1)

    def test_invalid_project_save_does_not_bind_uploads(self):
        with self.assertRaises(Invalid):
            self.project(reference_files=[{'id': 'untrusted'}], file_refs=['missing.txt'])
        self.assertIsNone(self.s.store.get('reference', self.ref['id'])['project_id'])
        self.assertFalse(self.s.store.all('project'))

    def test_reference_lists_are_bounded_and_deduplicated(self):
        p = self.s.project({'vision': 'Synthetic reference list', 'reference_ids': [self.ref['id']]*2})
        self.assertEqual(p['reference_files'], [self.ref])
        for values in [None, 'file', [5], [self.ref['id']]*31, ['missing']]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.s.project({'reference_ids': values}, p['id'])

    def test_removing_current_reference_keeps_approved_history(self):
        p = self.project()
        plan = self.plan(p)
        self.s.approve(plan['id'], plan['revision'])
        updated = self.s.project({'reference_ids': []}, p['id'])
        self.assertEqual(updated['reference_files'], [])
        self.assertEqual(self.s.store.get('plan', plan['id'])['context']['reference_files'], [self.ref])
        self.assertTrue(self.s.reference_file(self.ref['id']).is_file())
        with self.assertRaises(Invalid):
            self.s.launch(plan['id'])
        self.assertFalse(self.s.store.all('task'))

    def test_tampered_bytes_block_approval_and_coordinator(self):
        p = self.project()
        plan = self.plan(p)
        self.s.reference_file(self.ref['id']).write_bytes(b'X' * len(self.payload))
        with self.assertRaises(Invalid):
            self.s.approve(plan['id'], plan['revision'])
        adapter = FakeAdapter()
        self.s.adapter = adapter
        self.s.settings({'mode': 'codex'})
        messages = copy.deepcopy(self.s.store.all('message'))
        with self.assertRaises(Invalid):
            self.s.discuss(p['id'], 'Use the selected reference', 'codex')
        self.assertEqual(self.s.store.all('message'), messages)
        self.assertFalse(self.s.store.all('job'))
        self.assertFalse(adapter.calls)

    def test_tampered_bytes_block_launch_and_queued_prompt(self):
        p = self.project()
        plan = self.plan(p)
        self.s.approve(plan['id'], plan['revision'])
        path = self.s.reference_file(self.ref['id'])
        path.write_bytes(b'Tampered')
        with self.assertRaises(Invalid):
            self.s.launch(plan['id'])
        self.assertFalse(self.s.store.all('task'))
        path.write_bytes(self.payload)
        launched = self.s.launch(plan['id'])
        task = self.s.store.get('task', launched['task_ids'][0])
        path.write_bytes(b'Tampered again')
        with self.assertRaises(Invalid):
            self.s._prompt(task)

    def test_metadata_change_and_active_reference_edits_are_refused(self):
        p = self.project()
        plan = self.plan(p)
        self.s.approve(plan['id'], plan['revision'])
        self.s.launch(plan['id'])
        with self.assertRaises(Invalid):
            self.s.project({'reference_ids': []}, p['id'])
        record = self.s.store.get('reference', self.ref['id'])
        record['name'] = 'Changed metadata.txt'
        self.s.store.put('reference', record)
        with self.assertRaises(Invalid):
            self.s.reference_context(p)

    def test_canonical_context_stays_portable_but_prompt_has_read_only_paths(self):
        p = self.project()
        plan = self.plan(p)
        self.s.approve(plan['id'], plan['revision'])
        launched = self.s.launch(plan['id'])
        task = self.s.store.get('task', launched['task_ids'][0])
        prompt = self.s._prompt(task)
        context = json.loads(prompt.split('\n', 1)[1])['project']
        self.assertEqual(context['reference_files'][0]['path'], str(self.s.reference_file(self.ref['id'])))
        self.assertEqual(context['reference_files'][0]['access'], 'read-only')
        self.assertEqual(task['context']['reference_files'], [self.ref])
        self.assertEqual(self.s.store.get('project', p['id'])['reference_files'], [self.ref])

    def test_mock_conversation_can_read_selected_copies_without_delegating(self):
        p = self.project()
        frame = self.s.store.all('proposal')[0]['data']
        adapter = FakeAdapter(result=frame)
        self.s.adapter = adapter
        self.s.settings({'mode': 'codex'})
        self.s.discuss(p['id'], 'Use these reference notes', 'codex')
        deadline = time.monotonic()+2
        while self.s.active and time.monotonic()<deadline:
            time.sleep(.01)
        self.assertFalse(self.s.active)
        self.assertEqual(len(adapter.calls), 1)
        call = adapter.calls[0]
        self.assertEqual(call['sandbox'], 'read-only')
        context = json.loads(call['prompt'].split('\n')[-1])['project']
        self.assertEqual(Path(context['reference_files'][0]['path']).read_bytes(), self.payload)
        self.assertEqual(self.s.store.get('project', p['id'])['reference_files'], [self.ref])
        self.assertFalse(self.s.store.all('task'))
        self.assertFalse(self.s.store.all('plan'))


if __name__ == '__main__':
    unittest.main()
