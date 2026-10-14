"""Synthetic tests only. No Codex jobs or external accounts are used."""
import base64
import copy
from datetime import datetime, timezone, timedelta
import http.client
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import MagicMock, patch
import zipfile

from cos.adapter import CodexAdapter, completion, command_prefix, stop_process
from cos.safety import Invalid, digest, docx_text, local_file, working_directory
from cos.server import LocalServer
from cos.service import DEFAULT_CONFIG, Service, normalized_spec
from cos.store import uid


SID = "12345678-1234-4234-8234-123456789abc"
SID2 = "12345678-1234-4234-8234-123456789def"
GOOD = {"status": "completed", "summary": "Synthetic engineering report", "artifacts": [], "decisions": [], "next_steps": ["Human review"]}


def fake_docx(text="Review generic engineering notes", extra=None):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>')
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return out.getvalue()


def fixture_events(result=GOOD, sid=SID):
    return [{"type": "thread.started", "thread_id": sid}, {"type": "turn.started"},
            {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(result)}}, {"type": "turn.completed"}]


class FakeProcess:
    def __init__(self, events, code=0, stderr=""):
        self.stdin = io.StringIO()
        self.stdout = io.StringIO("".join((json.dumps(e) if not isinstance(e, str) else e) + "\n" for e in events))
        self.stderr = io.StringIO(stderr)
        self.pid = 987654321
        self.code = code
        self.killed = False
    def wait(self, timeout=None): return self.code
    def poll(self): return self.code
    def kill(self): self.killed = True


class FakeAdapter:
    """Injected adapter, never launches a process."""
    def __init__(self, result=None, hold=False, writer=None):
        self.capabilities = {"ok": True, "resume": True}
        self.result = copy.deepcopy(result or GOOD)
        self.hold, self.writer = hold, writer
        self.calls = []
        self.release = threading.Event()
    def argv(self, *args, **kwargs): return ["mock-only"]
    def preflight(self, config): return {"id":"preflight", "ok":True,"version":"mock", "help":{}, "model_verified":False}
    def run(self, config, cwd, sandbox, prompt, schema, cancel, update, session=None, **kwargs):
        index = len(self.calls)
        sid = session or str(__import__('uuid').UUID(int=index + 1))
        self.calls.append({"cwd":cwd,"sandbox":sandbox,"prompt":prompt,"session":session,"research_access":kwargs.get("research_access",False),"timeout_seconds":config["timeout_seconds"]})
        update({"session_id":sid,"progress":"Synthetic mock event"})
        if self.hold:
            while not self.release.wait(.005):
                if cancel.is_set(): return {"status":"cancelled","summary":"Stopped","session_id":sid}
        if self.writer: self.writer(Path(cwd))
        return dict(copy.deepcopy(self.result),session_id=sid)


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "notes.txt").write_text("Synthetic notes")
    def tearDown(self): self.tmp.cleanup()
    def test_docx_import_read_only(self):
        data=fake_docx(); p=self.root/'log.docx';p.write_bytes(data)
        text,sha=docx_text(data,p.name)
        self.assertIn('engineering',text);self.assertEqual(digest(p.read_bytes()),sha)
    def test_docx_never_extracts_or_follows_external_relationships(self):
        data=fake_docx(extra={'../../escape.txt':'untrusted','word/_rels/document.xml.rels':'http://example.invalid'})
        self.assertIn('engineering',docx_text(data,'log.docx')[0]);self.assertFalse((self.root/'escape.txt').exists())
    def test_docx_rejects_entity_expansion(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:z.writestr('word/document.xml','<!DOCTYPE w [<!ENTITY e "bad">]><w>&e;</w>')
        with self.assertRaises(Invalid):docx_text(out.getvalue(),'log.docx')
    def test_docx_invalid_and_extension(self):
        for data,name in [(b'bad','a.docx'),(fake_docx(),'a.docm')]:
            with self.subTest(name=name),self.assertRaises(Invalid):docx_text(data,name)
    def test_docx_utf16_entity_bypass_rejected(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            z.writestr('word/document.xml','<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE w [<!ENTITY e "bad">]><w>&e;</w>'.encode('utf-16'))
        with self.assertRaises(Invalid):docx_text(out.getvalue(),'log.docx')
    def test_docx_archive_limits(self):
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('word/document.xml',b'x'*(2*1024*1024+1))
        with self.assertRaises(Invalid):docx_text(out.getvalue(),'a.docx')
    def test_docx_duplicate_entries(self):
        out=io.BytesIO()
        with __import__('warnings').catch_warnings():
            __import__('warnings').simplefilter('ignore')
            with zipfile.ZipFile(out,'w') as z:
                z.writestr('word/document.xml','<w/>');z.writestr('word/document.xml','<w/>')
        with self.assertRaises(Invalid):docx_text(out.getvalue(),'a.docx')
    def test_paths_reject_cross_platform_traversal(self):
        for ref in ['../x','..\\x','C:\\x','/etc/passwd','//server/share','notes.txt:stream','a//b','a/./b']:
            with self.subTest(ref=ref),self.assertRaises(Invalid):local_file(self.root,ref,False)
    def test_paths_reject_symlinks(self):
        (self.root/'alias.txt').symlink_to(self.root/'notes.txt')
        with self.assertRaises(Invalid):local_file(self.root,'alias.txt')
    def test_path_missing_and_large(self):
        with self.assertRaises(Invalid):local_file(self.root,'missing.txt')
        with (self.root/'big.txt').open('wb') as f:f.truncate(8*1024*1024+1)
        with self.assertRaises(Invalid):local_file(self.root,'big.txt')
    def test_working_folder_protection(self):
        self.assertEqual(str(self.root.resolve()),working_directory(str(self.root)))
        for value in ['.',str(Path.home()),str(Path(self.root.anchor)),'\\\\server\\share']:
            with self.subTest(value=value),self.assertRaises((Invalid,FileNotFoundError)):working_directory(value)
        with self.assertRaises(Invalid):working_directory(str(self.root),[self.root])
    def test_completion_contract(self):
        self.assertEqual(GOOD,completion(copy.deepcopy(GOOD)))
        for value in [{'status':'completed'},dict(GOOD,status='accepted'),dict(GOOD,artifacts='oops'),dict(GOOD,summary='')]:
            with self.assertRaises(Invalid):completion(value)
    def test_agent_can_choose_output_paths(self):
        spec=normalized_spec({'title':'Write','purpose':'Write generic notes','criteria':['Useful notes'],'access':'workspace-write'})
        self.assertEqual(spec['expected_outputs'],[])


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.config=dict(DEFAULT_CONFIG,executable=sys.executable,model='5.6-Terra')
        self.calls=[]
        def run(args,**kwargs):
            self.calls.append((args,kwargs))
            if args[-1]=='--version': text='codex-cli mock-0.149'
            elif 'resume' in args:text='SESSION_ID --json --output-schema --skip-git-repo-check'
            elif 'exec' in args:text='--json --model --sandbox --output-schema --skip-git-repo-check'
            else:text='--sandbox --ask-for-approval --config'
            return subprocess.CompletedProcess(args,0,text,'')
        self.adapter=CodexAdapter(runner=run)
        self.adapter.preflight(self.config)
    def execute(self, events=None, code=0, cancel=None, session=None, stderr=''):
        process=FakeProcess(events if events is not None else fixture_events(),code,stderr)
        self.adapter.popen=MagicMock(return_value=process)
        updates=[]
        with patch('cos.adapter.stop_process') as stop:
            r=self.adapter.run(self.config,tempfile.gettempdir(),'read-only','Synthetic prompt',Path('schema.json'),cancel or threading.Event(),updates.append,session)
            self.assertEqual(stop.call_count,1)
        return r,updates,self.adapter.popen.call_args
    def test_help_only_preflight(self):
        self.assertEqual(len(self.calls),5)
        self.assertTrue(self.adapter.capabilities['ok'])
        self.assertFalse(self.adapter.capabilities['model_verified'])
        for args,kwargs in self.calls:self.assertIn(args[-1],['--version','--help']);self.assertFalse(kwargs['shell'])
    def test_missing_required_flags_refuses_work(self):
        self.adapter.runner=lambda *a,**k:subprocess.CompletedProcess([],0,'old CLI','')
        self.assertFalse(self.adapter.preflight(self.config)['ok'])
        with self.assertRaises(Invalid):self.adapter.argv(self.config,'/tmp','read-only','schema.json')
    def test_safe_argv_and_model_literal(self):
        config=dict(self.config,model='5.6-Terra;$(never-run)')
        argv=self.adapter.argv(config,'/tmp','workspace-write','schema.json')
        self.assertIn(config['model'],argv);self.assertIn('approval_policy="on-request"',argv)
        self.assertIn('approvals_reviewer="user"',argv)
        self.assertFalse(any(x in argv for x in ['--full-auto','--last','--all','--approve-for-me','--dangerously-bypass-approvals-and-sandbox']))
        self.assertIn('sandbox_workspace_write.network_access=false',argv)
        self.assertGreater(argv.index('--sandbox'),argv.index('exec'))
    def test_shell_wrapper_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'codex.cmd';p.write_text('test')
            with self.assertRaises(Invalid):command_prefix(dict(self.config,executable=str(p)))
    def test_structured_completion_and_session(self):
        r,updates,call=self.execute()
        self.assertEqual(r['status'],'completed');self.assertEqual(r['session_id'],SID)
        self.assertFalse(call.kwargs['shell']);self.assertEqual(call.kwargs['cwd'],tempfile.gettempdir())
        self.assertTrue(any(x.get('session_id')==SID for x in updates))
    def test_resume_routes_exact_session(self):
        r,_,call=self.execute(session=SID)
        argv=call.args[0];self.assertIn('resume',argv);self.assertIn(SID,argv);self.assertNotIn('--last',argv)
        self.assertEqual(r['session_id'],SID)
    def test_resume_wrong_session_fails(self):
        self.assertEqual(self.execute(fixture_events(sid=SID2),session=SID)[0]['status'],'failed')
    def test_resume_unsupported(self):
        self.adapter.capabilities['resume']=False
        with self.assertRaises(Invalid):self.adapter.argv(self.config,'/tmp','read-only','schema.json',SID)
    def test_no_schema_supported_still_validates_json(self):
        self.adapter.capabilities['schema']=False
        self.assertNotIn('--output-schema',self.adapter.argv(self.config,'/tmp','read-only','schema.json'))
        self.assertEqual(self.execute()[0]['status'],'completed')
    def test_malformed_stream_invalidates_completion(self):
        self.assertEqual(self.execute(['bad JSON']+fixture_events())[0]['status'],'blocked')
    def test_unknown_events_tolerated(self):
        self.assertEqual(self.execute([{'type':'future.event','metadata':1}]+fixture_events())[0]['status'],'completed')
    def test_error_event_not_overwritten_by_success_tail(self):
        r=self.execute([{'type':'error','message':'permission denied by sandbox'}]+fixture_events())[0]
        self.assertEqual(r['status'],'blocked')
    def test_exit_failure_not_completion(self):
        self.assertEqual(self.execute(code=2,stderr='execution failure')[0]['status'],'failed')
    def test_missing_turn_completed(self):
        self.assertEqual(self.execute(fixture_events()[:-1])[0]['status'],'failed')
    def test_missing_session(self):
        self.assertEqual(self.execute(fixture_events()[1:])[0]['status'],'failed')
    def test_bad_final_contract(self):
        self.assertEqual(self.execute(fixture_events({'status':'completed'}))[0]['status'],'blocked')
    def test_final_blocked_preserved(self):
        self.assertEqual(self.execute(fixture_events(dict(GOOD,status='blocked')))[0]['status'],'blocked')
    def test_cancellation_cleans_process(self):
        event=threading.Event();event.set()
        self.assertEqual(self.execute(cancel=event)[0]['status'],'cancelled')
    def test_invalid_stream_without_a_completed_turn_fails(self):
        self.assertEqual(self.execute(['x'*131074])[0]['status'],'failed')
    def test_timeout_blocked_and_cleanup(self):
        with patch('cos.adapter.time.monotonic',side_effect=[0,901]):
            self.assertEqual(self.execute()[0]['status'],'blocked')
    def test_invalid_uuid_and_typed_final_fail(self):
        self.assertEqual(self.execute(fixture_events(sid='-'*36))[0]['status'],'failed')
        events=fixture_events();events[2]['item']['text']={'not':'a string'}
        self.assertEqual(self.execute(events)[0]['status'],'blocked')
    def test_posix_tree_cleanup_even_if_root_exited(self):
        p=FakeProcess([])
        with patch('cos.adapter.os.killpg') as kill:
            stop_process(p)
            self.assertEqual(kill.call_count,2)
            self.assertEqual(kill.call_args.args[0],p.pid)
    def test_windows_job_cleanup_mocked(self):
        p=FakeProcess([]);job=MagicMock();stop_process(p,job)
        job.close.assert_called_once()


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.s=Service(self.root/'data',start=False,demo_delay=.015)
        self.p=self.s.project({'name':'Synthetic engineering','goal':'Review a generic engineering checklist'})
    def tearDown(self):
        self.s.close();self.tmp.cleanup()
    def draft(self, count=1):return self.s.plan(self.p['id'],'\n'.join('- Review generic checklist '+str(i) for i in range(count)),'Synthetic log')
    def launch(self, count=1, access='read-only', scenario='success'):
        plan=self.draft(count)
        if access!='read-only' or scenario!='success':
            specs=copy.deepcopy(plan['specs'])
            for s in specs:s.update(access=access,scenario=scenario,expected_outputs=['result.txt'] if access=='workspace-write' else [])
            plan=self.s.edit_plan(plan['id'],plan['revision'],specs)
        self.s.approve(plan['id'],plan['revision']);return self.s.launch(plan['id'])
    def drain(self):
        deadline=time.monotonic()+3
        while time.monotonic()<deadline:
            self.s.tick()
            if not self.s.active and not any(t['state']=='queued' for t in self.s.store.all('task')):return
            time.sleep(.01)
        self.fail('Worker did not drain')
    def test_explicit_approval_and_launch(self):
        plan=self.draft()
        with self.assertRaises(Invalid):self.s.launch(plan['id'])
        self.s.approve(plan['id'],plan['revision']);self.assertEqual(self.s.store.all('task'),[])
        self.s.launch(plan['id']);self.drain()
        self.assertEqual(self.s.store.all('task')[0]['state'],'ready_for_review')
    def test_duplicate_launch_creates_no_duplicate_tasks(self):
        p=self.launch(3)
        self.assertEqual(self.s.launch(p['id'])['task_ids'],p['task_ids']);self.assertEqual(len(self.s.store.all('task')),3)
    def test_plan_edit_invalidates_approval_and_stale_revision(self):
        p=self.draft();self.s.approve(p['id'],p['revision']);p=self.s.edit_plan(p['id'],p['revision'],p['specs'])
        with self.assertRaises(Invalid):self.s.launch(p['id'])
        with self.assertRaises(Invalid):self.s.approve(p['id'],p['revision']-1)
    def test_setting_change_requires_reapproval(self):
        p=self.draft();self.s.approve(p['id'],p['revision']);self.s.settings({'model':'Unverified corporate model'})
        with self.assertRaises(Invalid):self.s.launch(p['id'])
    def test_new_context_requires_review_again(self):
        plan=self.draft();self.s.record(self.p['id'],'New suggestion','assumption','Synthetic source')
        r=self.s.approve(plan['id'],plan['revision']);self.assertTrue(r['refreshed']);self.assertEqual(r['plan']['state'],'draft')
    def test_context_records_require_approval_and_have_provenance(self):
        r=self.s.record(self.p['id'],'Use generic data','decision','Synthetic source')
        self.assertEqual(r['status'],'suggested')
        items=[{'project_id':self.p['id'],'record_id':r['id'],'action':'approve'}]
        self.s.resolve_batch(items);self.s.resolve_batch(items)
        approved=self.s.store.get('project',self.p['id'])['records'][0]
        self.assertEqual(approved['status'],'approved');self.assertEqual(approved['provenance'],'Synthetic source')
    def test_batch_atomic_on_invalid_answer(self):
        a=self.s.record(self.p['id'],'Assumption','assumption');q=self.s.record(self.p['id'],'Question?','question')
        with self.assertRaises(Invalid):self.s.resolve_batch([{'project_id':self.p['id'],'record_id':a['id'],'action':'approve'},{'project_id':self.p['id'],'record_id':q['id'],'action':'answer','answer':''}])
        self.assertEqual(self.s.store.get('project',self.p['id'])['records'][0]['status'],'suggested')
    def test_ready_is_separate_from_accepted(self):
        self.launch();self.drain();t=self.s.store.all('task')[0]
        self.assertEqual(self.s.store.get('project',self.p['id'])['accepted_results'],[])
        self.s.review(t['id']);self.s.action(t['id'],'accept');self.s.action(t['id'],'accept')
        self.assertEqual(len(self.s.store.get('project',self.p['id'])['accepted_results']),1)
    def test_accept_tampered_output_refused(self):
        self.launch();self.drain();t=self.s.store.all('task')[0]
        self.s.output(t['id'],'completion.json').write_text('tampered')
        with self.assertRaises(Invalid):self.s.action(t['id'],'accept')
    def test_simulation_labeled_and_does_not_write_project(self):
        self.launch(access='workspace-write');self.drain();t=self.s.store.all('task')[0]
        self.assertIn('SIMULATED',t['result']['summary']);self.assertFalse((Path(t['context']['cwd'])/'result.txt').exists())
    def test_failed_and_blocked_preserved(self):
        for scenario in ['failed','blocked']:
            p=self.launch(scenario=scenario);self.drain();t=self.s.store.get('task',p['task_ids'][0]);self.assertEqual(t['state'],scenario)
            with self.assertRaises(Invalid):self.s.action(t['id'],'accept')
    def test_multiple_task_sessions_are_distinct(self):
        self.launch(4);self.drain();self.assertEqual(len({t['session_id'] for t in self.s.store.all('task')}),4)
    def test_writer_lock_serializes_same_project(self):
        self.launch(3,access='workspace-write',scenario='slow');self.s.tick()
        self.assertEqual(len(self.s.active),1)
        self.assertEqual(sum(t['state']=='queued' for t in self.s.store.all('task')),2)
    def test_readers_parallel_and_concurrency_limit(self):
        self.s.settings({'concurrency':2})
        self.launch(4,scenario='slow');self.s.tick();self.assertEqual(len(self.s.active),2)
    def test_overlap_writer_and_reader_locks(self):
        self.s.active['fake']={'cwd':self.p['cwd'],'access':'workspace-write'}
        self.assertTrue(self.s._locked(str(Path(self.p['cwd'])/'sub'),'read-only'))
        self.s.active.clear()
    def test_cancel_and_pause_release_slot(self):
        plan=self.launch(2,scenario='slow');self.s.tick()
        for tid,action in zip(plan['task_ids'],['pause','cancel']):self.s.action(tid,action)
        self.drain();self.assertFalse(self.s.active)
        self.assertEqual([self.s.store.get('task',t)['state'] for t in plan['task_ids']],['paused','cancelled'])
    def test_queued_cancel_does_not_start(self):
        p=self.launch();tid=p['task_ids'][0];self.s.action(tid,'cancel');self.s.tick();self.assertFalse(self.s.active)
    def test_settings_cannot_change_active_or_queued_execution(self):
        self.launch()
        with self.assertRaises(Invalid):self.s.settings({'mode':'codex'})
    def test_revision_requires_new_plan_and_approval(self):
        self.launch();self.drain();t=self.s.store.all('task')[0]
        p=self.s.action(t['id'],'revise','Check a second generic example')
        self.assertEqual(p['state'],'draft');self.assertEqual(self.s.store.get('task',t['id'])['state'],'superseded')
        with self.assertRaises(Invalid):self.s.launch(p['id'])
    def test_persistence_restart_and_scheduled_deduplication(self):
        self.launch();self.drain();self.s.settings({'briefing_times':['09:00']})
        at=datetime(2026,10,9,9,0,tzinfo=timezone.utc)
        self.s.scheduled_briefings(at);self.s.scheduled_briefings(at)
        self.s.close();self.s=Service(self.root/'data',start=False)
        self.s.scheduled_briefings(at)
        self.assertEqual(len(self.s.store.all('briefing')),1);self.assertEqual(len(self.s.store.all('task')),1)
    def test_no_catchup_when_service_closed_and_dst_wall_dedup(self):
        self.s.settings({'briefing_times':['01:30']})
        self.s.scheduled_briefings(datetime(2026,11,1,1,30,tzinfo=timezone(timedelta(hours=-4))))
        self.s.scheduled_briefings(datetime(2026,11,1,1,30,tzinfo=timezone(timedelta(hours=-5))))
        self.s.scheduled_briefings(datetime(2026,11,1,2,0,tzinfo=timezone(timedelta(hours=-5))))
        self.assertEqual(len(self.s.store.all('briefing')),1)
    def test_interrupted_recovery_requires_stopped_confirmation(self):
        plan=self.launch();tid=plan['task_ids'][0];t=self.s.store.get('task',tid);t.update(state='running');self.s.store.put('task',t)
        self.s.close();self.s=Service(self.root/'data',start=False)
        self.assertTrue(self.s.store.get('task',tid)['recovery_lock'])
        self.assertTrue(self.s._locked(self.p['cwd'],'workspace-write'))
        with self.assertRaises(Invalid):self.s.action(tid,'revise','Retry')
        p=self.s.action(tid,'revise','Retry',confirmed_stopped=True)
        self.assertEqual(p['state'],'draft');self.assertFalse(self.s._locked(self.p['cwd'],'workspace-write'))
    def test_only_one_service_per_data_folder(self):
        with self.assertRaises(ValueError):Service(self.root/'data',start=False)
    def test_file_reference_validation(self):
        with self.assertRaises(Invalid):self.s.project({'name':'X','goal':'X','cwd':str(self.root),'file_refs':['../escape']})
    def test_schedule_configuration_validation(self):
        for raw in [{'concurrency':-1},{'concurrency':True},{'briefing_times':['25:00']},{'timeout_seconds':0},{'schedule_enabled':'true'}]:
            with self.subTest(raw=raw),self.assertRaises(Invalid):self.s.settings(raw)


class RealIntegrationMocks(ServiceTests):
    """These tests exercise Codex-mode orchestration through an injected mock."""
    def setUp(self):
        super().setUp();self.adapter=FakeAdapter();self.s.adapter=self.adapter
        self.work=self.root/'project';self.work.mkdir()
        self.p=self.s.project({'id':self.p['id'],'name':self.p['name'],'goal':self.p['goal'],'cwd':str(self.work)},self.p['id'])
        self.s.settings({'mode':'codex'})
    # Avoid inheriting the generic suite a second time.
    def test_missing_artifact_is_a_review_limit(self):
        self.launch(access='workspace-write');self.drain()
        task=self.s.store.all('task')[0]
        self.assertEqual(task['state'],'ready_for_review');self.assertTrue(task['handoff_issues'])
        self.assertEqual(task['delivery_status'],'partial')
    def test_unchanged_artifact_does_not_verify_completion(self):
        (self.work/'result.txt').write_text('Old result');self.launch(access='workspace-write');self.drain()
        task=self.s.store.all('task')[0]
        self.assertEqual(task['state'],'ready_for_review')
        self.assertIn('unchanged',task['delivery_notes'][0])
    def test_actual_changed_artifact_validated_and_snapshotted(self):
        self.adapter.writer=lambda p:(p/'result.txt').write_text('Synthetic new evidence')
        plan=self.launch(access='workspace-write');self.drain();t=self.s.store.get('task',plan['task_ids'][0])
        self.assertEqual(t['state'],'ready_for_review');self.assertEqual(len(t['output_links']),3)
        self.assertEqual(self.s.output(t['id'],'artifact-00.txt').read_text(),'Synthetic new evidence')
    def test_blocked_partial_files_are_reviewable_but_cannot_be_accepted(self):
        self.adapter.writer=lambda p:(p/'partial.txt').write_text('Partial research only')
        self.adapter.result=dict(GOOD,status='blocked',artifacts=['partial.txt'],decisions=['A source needs owner review.'])
        plan=self.launch(access='workspace-write');self.drain();t=self.s.store.get('task',plan['task_ids'][0])
        self.assertEqual(t['state'],'blocked')
        self.assertTrue(t['output_links'][0]['partial'])
        self.assertEqual(self.s.output(t['id'],'artifact-00.txt').read_text(),'Partial research only')
        with self.assertRaises(Invalid):self.s.action(t['id'],'accept')
        self.assertFalse(self.s.store.get('project',self.p['id'])['accepted_results'])
        self.assertTrue(all(r['category']=='suggestion' for r in self.s.store.get('project',self.p['id'])['records']))
        self.assertTrue(t['finished_at'])
    def test_invalid_partial_path_does_not_hide_original_blocker(self):
        self.adapter.result=dict(GOOD,status='blocked',artifacts=['../escape.txt'],summary='Source unavailable')
        plan=self.launch(access='workspace-write');self.drain();t=self.s.store.get('task',plan['task_ids'][0])
        self.assertEqual(t['state'],'blocked')
        self.assertEqual(t['result']['summary'],'Source unavailable')
        self.assertIn('../escape.txt',t['handoff_issues'][0])
        self.assertTrue(t['snapshot_limits'])
        self.assertEqual(len(t['output_links']),2) # Original handoff and structured report.
    def test_unexpected_old_artifact_cannot_hide_unchanged_expected(self):
        (self.work/'result.txt').write_text('Old');(self.work/'other.txt').write_text('Other old')
        self.adapter.result=dict(GOOD,artifacts=['other.txt']);self.launch(access='workspace-write');self.drain()
        task=self.s.store.all('task')[0]
        self.assertEqual(task['state'],'ready_for_review')
        self.assertIn('unchanged',task['delivery_notes'][0])
    def test_revision_resumes_only_own_session(self):
        plan=self.launch(2);self.drain();first=self.s.store.get('task',plan['task_ids'][0]);second=self.s.store.get('task',plan['task_ids'][1])
        rev=self.s.action(first['id'],'revise','Check evidence again');self.s.approve(rev['id'],rev['revision']);self.s.launch(rev['id']);self.drain()
        self.assertEqual(self.adapter.calls[-1]['session'],first['session_id']);self.assertNotEqual(self.adapter.calls[-1]['session'],second['session_id'])
    def test_changed_model_starts_fresh_session(self):
        plan=self.launch();self.drain();t=self.s.store.get('task',plan['task_ids'][0]);self.s.settings({'model':'Different corporate model'})
        rev=self.s.action(t['id'],'revise','Review again');self.assertNotIn('resume_session',rev['specs'][0])
    def test_model_backed_planning_path(self):
        self.adapter.result={'status':'completed','summary':'Synthetic mock model plan','tasks':[{'title':'Review notes','purpose':'Inspect generic notes','criteria':['Report evidence'],'access':'read-only','expected_outputs':[]}],'suggestions':[]}
        job=self.s.plan(self.p['id'],'Review notes','Synthetic input','codex')
        for _ in range(100):
            if not self.s.active:break
            time.sleep(.01)
        job=self.s.store.get('job',job['id']);self.assertEqual(job['state'],'completed')
        plan=self.s.store.get('plan',job['plan_id']);self.assertIn('Model-backed',plan['basis']);self.assertEqual(plan['state'],'draft')
        self.assertEqual(self.s.store.all('task'),[])
    def test_model_backed_review_cannot_accept(self):
        plan=self.launch();self.drain();t=self.s.store.get('task',plan['task_ids'][0]);job=self.s.review(t['id'],'codex')
        for _ in range(100):
            if not self.s.active:break
            time.sleep(.01)
        t=self.s.store.get('task',t['id']);self.assertEqual(t['state'],'ready_for_review');self.assertIn('Model-backed',t['review']['basis'])
    def test_coordinator_blocked_preserved(self):
        self.adapter.result=dict(GOOD,status='blocked',summary='Sandbox approval required')
        job=self.s.plan(self.p['id'],'Review notes','Synthetic input','codex')
        for _ in range(100):
            if not self.s.active:break
            time.sleep(.01)
        self.assertEqual(self.s.store.get('job',job['id'])['state'],'blocked');self.assertFalse(self.s.store.all('plan'))
    def test_coordinator_cancellation_and_cleanup(self):
        self.adapter.hold=True
        job=self.s.plan(self.p['id'],'Review notes','Synthetic input','codex')
        self.s.stop_job(job['id'])
        for _ in range(100):
            if not self.s.active:break
            time.sleep(.01)
        self.assertFalse(self.s.active);self.assertEqual(self.s.store.get('job',job['id'])['state'],'cancelled')
    def test_directory_change_starts_fresh_session(self):
        plan=self.launch();self.drain();t=self.s.store.get('task',plan['task_ids'][0]);other=self.root/'other';other.mkdir()
        self.s.project({'name':self.p['name'],'goal':self.p['goal'],'cwd':str(other)},self.p['id'])
        rev=self.s.action(t['id'],'revise','Review in the new folder');self.assertNotIn('resume_session',rev['specs'][0])
    def test_restart_pauses_unstarted_real_jobs(self):
        plan=self.launch();tid=plan['task_ids'][0]
        self.s.close();self.s=Service(self.root/'data',adapter=self.adapter,start=False)
        self.assertEqual(self.s.store.get('task',tid)['state'],'paused')
        self.s.tick();self.assertFalse(self.s.active)
    def test_session_from_other_task_cannot_complete(self):
        plan=self.launch(2);self.drain();first=self.s.store.get('task',plan['task_ids'][0]);second=self.s.store.get('task',plan['task_ids'][1])
        rev=self.s.action(first['id'],'revise','Review again')
        self.adapter.result=dict(GOOD,session_id=second['session_id'])
        # Mock a broken adapter whose returned session disagrees with its events.
        original=self.adapter.run
        def wrong(*a,**k):
            r=original(*a,**k);r['session_id']=second['session_id'];return r
        self.adapter.run=wrong
        self.s.approve(rev['id'],rev['revision']);launched=self.s.launch(rev['id']);self.drain()
        self.assertEqual(self.s.store.get('task',launched['task_ids'][0])['state'],'failed')


# unittest inherits tests; remove the base test methods for this specialised class
# without changing the base suite itself.
for _name in list(ServiceTests.__dict__):
    if _name.startswith('test_') and _name not in RealIntegrationMocks.__dict__:
        setattr(RealIntegrationMocks,_name,None)


class HTTPTests(unittest.TestCase):
    def test_output_download_decodes_registered_nested_snapshot_name(self):
        p=self.s.project({'name':'Download fixture','goal':'Test a saved handoff'})
        plan=self.s.plan(p['id'],'- Inspect fixture','Synthetic fixture')
        self.s.approve(plan['id'],plan['revision']);plan=self.s.launch(plan['id'])
        task=self.s.store.get('task',plan['task_ids'][0])
        folder=self.s.data/'outputs'/task['id']/'recovered-fixture';folder.mkdir(parents=True,exist_ok=True)
        (folder/'agent-report.txt').write_text('Retained report')
        task['output_links']=[{'name':'recovered-fixture/agent-report.txt','label':'Original report','sha256':digest(b'Retained report')}]
        self.s.store.put('task',task)
        status,body,_=self.request('/api/output/'+task['id']+'/recovered-fixture%2Fagent-report.txt')
        self.assertEqual(status,200);self.assertEqual(body,b'Retained report')
        self.assertEqual(self.request('/api/output/'+task['id']+'/%2E%2E%2Fsecret.txt')[0],400)

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name,start=False)
        self.server=LocalServer(0,self.s);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.port=self.server.server_port;self.cookie='cos_session='+self.server.token
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.s.close();self.tmp.cleanup()
    def request(self,path='/',body=None,auth=True,origin=True,host=None,reqid=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=3)
        headers={}
        if host:headers['Host']=host
        if auth:headers['Cookie']=self.cookie
        if body is not None:
            headers.update({'Content-Type':'application/json','X-CoS-CSRF':self.server.csrf,'Origin':self.server.origin if origin else 'http://evil.invalid'})
            body=json.dumps(dict(body,request_id=reqid or uid()))
        conn.request('POST' if body is not None else 'GET',path,body,headers)
        r=conn.getresponse();data=r.read();conn.close();return r.status,data,dict(r.getheaders())
    def test_loopback_private_cookie_and_csp(self):
        self.assertEqual(self.server.server_address[0],'127.0.0.1')
        self.assertEqual(self.request('/api/state',auth=False)[0],401)
        status,data,headers=self.request('/?token='+self.server.token,auth=False)
        self.assertEqual(status,200);self.assertIn('HttpOnly',headers['Set-Cookie']);self.assertIn("frame-ancestors 'none'",headers['Content-Security-Policy'])
    def test_host_and_origin_protection(self):
        self.assertEqual(self.request('/api/state',host='evil.invalid')[0],403)
        self.assertEqual(self.request('/api/briefing',{},origin=False)[0],403)
    def test_project_assignment_requires_private_session_and_reuses_single_draft(self):
        p=json.loads(self.request('/api/project',{'vision':'Build an interactive synthetic viewer'})[1])
        body={'project_id':p['id']}
        self.assertEqual(self.request('/api/project-assignment',body,auth=False)[0],401)
        self.assertEqual(self.request('/api/project-assignment',body,origin=False)[0],403)
        rid=uid()
        first=self.request('/api/project-assignment',body,reqid=rid)
        self.assertEqual(first[0],200)
        self.assertEqual(first[1],self.request('/api/project-assignment',body,reqid=rid)[1])
        plan=json.loads(first[1])
        self.assertEqual(plan['scope'],'project')
        self.assertEqual(len(plan['specs']),1)
        self.assertFalse(self.s.store.all('task'))
    def test_path_picker_requires_private_origin_and_does_not_save_listings(self):
        body={'mode':'directory','path':self.tmp.name}
        self.assertEqual(self.request('/api/browse',body,auth=False)[0],401)
        self.assertEqual(self.request('/api/browse',body,origin=False)[0],403)
        status,data,_=self.request('/api/browse',body)
        self.assertEqual(status,200)
        self.assertIn('entries',json.loads(data))
        self.assertFalse(self.s.store.all('request'))
        self.assertFalse(self.s.store.all('project'))
        self.assertEqual(self.request('/api/browse',{'mode':'references','root':self.tmp.name})[0],400)
    def test_idempotent_request_persists_across_retry(self):
        rid=uid();body={'name':'Generic project','goal':'Review engineering notes'}
        a=self.request('/api/project',body,reqid=rid);b=self.request('/api/project',body,reqid=rid)
        self.assertEqual(a[1],b[1]);self.assertEqual(len(self.s.store.all('project')),1)
        self.assertEqual(self.request('/api/project',dict(body,name='Different'),reqid=rid)[0],400)
    def test_safe_docx_import_endpoint(self):
        raw=fake_docx();status,data,_=self.request('/api/import',{'filename':'synthetic.docx','base64':base64.b64encode(raw).decode()})
        self.assertEqual(status,200);self.assertEqual(json.loads(data)['sha256'],digest(raw));self.assertIn('Read-only DOCX',json.loads(data)['source'])
    def test_reference_upload_is_private_idempotent_and_downloadable(self):
        raw=b'Synthetic local reference'
        body={'filename':'référence <sample>.txt','base64':base64.b64encode(raw).decode()}
        self.assertEqual(self.request('/api/reference-upload',body,auth=False)[0],401)
        self.assertEqual(self.request('/api/reference-upload',body,origin=False)[0],403)
        rid=uid();a=self.request('/api/reference-upload',body,reqid=rid);b=self.request('/api/reference-upload',body,reqid=rid)
        self.assertEqual(a[0],200);self.assertEqual(a[1],b[1]);self.assertEqual(len(self.s.store.all('reference')),1)
        ref=json.loads(a[1]);url='/api/reference/'+ref['id']
        self.assertEqual(self.request(url,auth=False)[0],401)
        status,data,headers=self.request(url)
        self.assertEqual(status,200);self.assertEqual(data,raw)
        self.assertIn("filename*=UTF-8''r%C3%A9f",headers['Content-Disposition'])
        self.assertEqual(headers['Content-Type'],'application/octet-stream')
        self.assertEqual(headers['X-Content-Type-Options'],'nosniff')
        self.assertEqual(self.request('/reference-files.js')[0],200)
    def test_reference_endpoint_bounds_and_unsaved_discard(self):
        self.assertEqual(self.request('/api/reference-upload',{'filename':'../escape','base64':'eA=='})[0],400)
        self.assertEqual(self.request('/api/reference-upload',{'filename':'notes.txt','base64':'not base64'})[0],400)
        ref=json.loads(self.request('/api/reference-upload',{'filename':'notes.txt','base64':'eA=='})[1])
        self.assertFalse(self.s.store.all('project'))
        self.assertEqual(self.request('/api/reference-discard',{'id':ref['id']},origin=False)[0],403)
        self.assertEqual(self.request('/api/reference-discard',{'id':ref['id']})[0],200)
        self.assertEqual(self.request('/api/reference/'+ref['id'])[0],400)
    def test_reference_save_without_cwd_never_approves_or_launches(self):
        ref=json.loads(self.request('/api/reference-upload',{'filename':'notes.txt','base64':'eA=='})[1])
        status,body,_=self.request('/api/project',{'vision':'Synthetic selected references','reference_ids':[ref['id']]})
        self.assertEqual(status,200);self.assertEqual(json.loads(body)['reference_files'],[ref])
        self.assertEqual(self.request('/api/reference-discard',{'id':ref['id']})[0],400)
        self.assertFalse(self.s.store.all('task'));self.assertFalse(self.s.store.all('plan'))
    def test_validated_artifact_download_is_attachment(self):
        p=self.s.project({'name':'Synthetic project','goal':'Review generic notes'})
        plan=self.s.plan(p['id'],'Review notes','Synthetic input');self.s.approve(plan['id'],plan['revision']);plan=self.s.launch(plan['id'])
        self.s.demo_delay=.01;self.s.tick()
        deadline=time.monotonic()+2
        while self.s.active and time.monotonic()<deadline:time.sleep(.01)
        tid=plan['task_ids'][0]
        status,data,headers=self.request('/api/output/'+tid+'/completion.json')
        self.assertEqual(status,200);self.assertEqual(json.loads(data)['status'],'completed')
        self.assertIn('attachment',headers['Content-Disposition']);self.assertEqual(headers['X-Content-Type-Options'],'nosniff')
    def test_no_arbitrary_file_endpoint(self):
        self.assertEqual(self.request('/../../etc/passwd')[0],404)
        self.assertEqual(self.request('/api/output/missing/anything.txt')[0],400)
    def test_http_approve_launch_duplicate_workflow(self):
        p=json.loads(self.request('/api/project',{'name':'Generic','goal':'Review generic notes'})[1])
        plan=json.loads(self.request('/api/plan',{'project_id':p['id'],'bullets':'- Review notes'})[1])
        self.assertEqual(self.request('/api/launch',{'id':plan['id']})[0],400)
        self.assertEqual(self.request('/api/approve',{'id':plan['id'],'revision':plan['revision']})[0],200)
        for _ in range(2):self.assertEqual(self.request('/api/launch',{'id':plan['id']})[0],200)
        self.assertEqual(len(self.s.store.all('task')),1)

    def test_project_workflow_endpoints_preserve_explicit_launch(self):
        status,body,_=self.request('/api/project',{'vision':'Synthetic viewer vision'})
        self.assertEqual(status,200);p=json.loads(body)
        status,body,_=self.request('/api/breakdown',{'project_id':p['id']})
        self.assertEqual(status,200);proposal=json.loads(body)
        self.assertEqual(self.request('/api/proposal',{'id':proposal['id'],'action':'adopt'})[0],200)
        item=next(x for x in self.s.store.all('work_item') if x['kind']=='investigation')
        status,body,_=self.request('/api/delegate',{'project_id':p['id'],'item_ids':[item['id']]})
        self.assertEqual(status,200);plan=json.loads(body)
        self.assertFalse(self.s.store.all('task'))
        self.assertEqual(self.request('/api/approve',{'id':plan['id'],'revision':plan['revision']})[0],200)
        self.assertFalse(self.s.store.all('task'))
        self.assertEqual(self.request('/api/launch',{'id':plan['id']})[0],200)
        self.assertEqual(len(self.s.store.all('task')),1)

    def test_discussion_preferences_and_workspace_asset(self):
        p=json.loads(self.request('/api/project',{'vision':'Synthetic vision'})[1])
        self.assertEqual(self.request('/api/discuss',{'project_id':p['id'],'text':'Resume with the sample'})[0],200)
        self.assertEqual(self.request('/api/portfolio',{'minutes':15,'focus_project':p['id']})[0],200)
        self.assertEqual(self.request('/workspace.js')[0],200)
        state=json.loads(self.request('/api/state')[1])
        self.assertIn('Resume with the sample',state['portfolio']['landscape'][0]['last_left'])
        self.assertEqual(state['portfolio']['preferences']['minutes'],15)
        self.assertEqual(self.request('/api/delegate',{'project_id':p['id'],'item_ids':[]},origin=False)[0],403)

    def test_automatic_review_endpoints_preserve_creation_and_idempotency(self):
        self.s.adapter=FakeAdapter();self.s.settings({'mode':'codex'})
        rid=uid();body={'vision':'Synthetic automatic project review'}
        a=self.request('/api/project',body,reqid=rid);b=self.request('/api/project',body,reqid=rid)
        self.assertEqual(a[0],200);self.assertEqual(a[1],b[1])
        p=json.loads(a[1]);self.assertEqual(len(self.s.store.all('setup_review')),1)
        review_body={'project_id':p['id']}
        self.assertEqual(self.request('/api/project-review',review_body,origin=False)[0],403)
        self.assertEqual(self.request('/api/project-review',review_body,auth=False)[0],401)
        self.assertEqual(self.request('/api/project-review',review_body)[0],200)
        self.assertEqual(self.request('/api/cancel-project-review',review_body)[0],200)
        self.s.tick();self.assertFalse(self.s.adapter.calls)
        self.assertFalse(self.s.store.all('task'));self.assertFalse(self.s.store.all('plan'))
        state=json.loads(self.request('/api/state')[1])
        self.assertEqual(state['setup_reviews'][0]['state'],'cancelled')

    def test_message_delivery_retry_returns_one_receipt_and_one_job(self):
        p=self.s.project({'vision':'Synthetic delivery feedback'})
        frame=dict(self.s.store.all('proposal')[0]['data'],status='completed')
        adapter=FakeAdapter(frame,hold=True);self.s.adapter=adapter;self.s.settings({'mode':'codex'})
        body={'project_id':p['id'],'text':'Synthetic sent message','method':'codex'};rid=uid()
        a=self.request('/api/discuss',body,reqid=rid);b=self.request('/api/discuss',body,reqid=rid)
        self.assertEqual(a[0],200);self.assertEqual(a[1],b[1])
        result=json.loads(a[1]);self.assertEqual(result['message']['delivery']['job_id'],result['id'])
        self.assertEqual(result['message']['delivery']['request_id'],rid)
        self.assertEqual(self.s.store.get('message',result['message']['id'])['delivery']['request_id'],rid)
        self.assertEqual(len(self.s.store.all('job')),1)
        self.assertEqual(len([m for m in self.s.store.all('message') if m['text']==body['text']]),1)
        self.assertEqual(self.request('/conversation-feedback.js')[0],200)
        adapter.release.set()


if __name__=='__main__':unittest.main()
