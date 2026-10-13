"""Command-center lifecycle and execution-policy checks; no real agent jobs."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

import test_app
import test_research
from cos.safety import Invalid
from cos.service import normalized_spec


class ExecutionPolicyTests(unittest.TestCase):
    setUp = test_app.AdapterTests.setUp

    def test_yolo_is_explicit_and_routes_both_new_and_exact_resume(self):
        self.adapter.capabilities.update(yolo=True, resume_yolo=True)
        for session in (None, test_app.SID):
            args=self.adapter.argv(self.config,'/tmp','workspace-write','schema.json',session,execution_policy='yolo')
            self.assertIn('--dangerously-bypass-approvals-and-sandbox',args)
            self.assertNotIn('--sandbox',args)
            self.assertFalse(any('approval_policy=' in x or 'network_access=' in x for x in args))
            if session:
                self.assertEqual(args[args.index('resume')+1],'--dangerously-bypass-approvals-and-sandbox')
                self.assertIn(session,args);self.assertNotIn('--last',args)
        safe=self.adapter.argv(self.config,'/tmp','workspace-write','schema.json')
        self.assertIn('--sandbox',safe);self.assertNotIn('--dangerously-bypass-approvals-and-sandbox',safe)

    def test_capability_policy_and_read_only_checks(self):
        with self.assertRaises(Invalid):self.adapter.argv(self.config,'/tmp','workspace-write','schema.json',execution_policy='yolo')
        self.adapter.capabilities.update(yolo=True,resume_yolo=False)
        with self.assertRaises(Invalid):self.adapter.argv(self.config,'/tmp','workspace-write','schema.json',test_app.SID,execution_policy='yolo')
        with self.assertRaises(Invalid):self.adapter.argv(self.config,'/tmp','read-only','schema.json',execution_policy='yolo')

    def test_policy_reaches_subprocess_without_shell_and_keeps_completion_contract(self):
        self.adapter.capabilities.update(yolo=True,resume_yolo=True)
        process=test_app.FakeProcess(test_app.fixture_events(sid=test_app.SID))
        self.adapter.popen=test_app.MagicMock(return_value=process)
        with patch('cos.adapter.stop_process'):
            result=self.adapter.run(self.config,'/tmp','workspace-write','Fixture','schema.json',threading.Event(),lambda x:None,test_app.SID,execution_policy='yolo')
        self.assertEqual(result['status'],'completed');self.assertEqual(result['session_id'],test_app.SID)
        self.assertFalse(self.adapter.popen.call_args.kwargs['shell'])
        self.assertIn('--dangerously-bypass-approvals-and-sandbox',self.adapter.popen.call_args.args[0])


class CommandCenterTests(unittest.TestCase):
    def setUp(self):
        test_research.ResearchServiceTests.setUp(self)
        self.s.cancel_project_review(self.p['id'])
    tearDown = test_research.ResearchServiceTests.tearDown
    draft = test_research.ResearchServiceTests.draft
    drain = test_app.ServiceTests.drain

    def items(self):return self.s.snapshot()['attention']

    def finished(self):
        plan=self.draft();self.s.approve(plan['id'],plan['revision']);launched=self.s.launch(plan['id']);self.drain()
        return self.s.store.get('task',launched['task_ids'][0])

    def test_queue_follows_approval_launch_handoff_and_continuation(self):
        plan=self.draft()
        self.assertEqual([(x['kind'],x['group']) for x in self.items()],[('plan','approvals')])
        self.s.approve(plan['id'],plan['revision']);self.assertEqual(self.items()[0]['action'],'Review & launch')
        launched=self.s.launch(plan['id']);self.assertFalse(self.items());self.drain()
        task=self.s.store.get('task',launched['task_ids'][0]);self.assertEqual(task['state'],'blocked')
        self.assertEqual([(x['target_id'],x['group']) for x in self.items()],[(task['id'],'handoffs')])
        resumed=self.s.action(task['id'],'resume','I completed the manual check; verify the remaining outputs.')
        self.assertEqual(resumed['specs'][0]['resume_session'],task['session_id'])
        self.assertEqual(resumed['specs'][0]['resume_context']['task_id'],task['id'])
        self.assertEqual(resumed['specs'][0]['purpose'],task['purpose'])
        self.assertEqual([x['target_id'] for x in self.items()],[resumed['id']])
        self.assertFalse(self.s.active)
        with self.assertRaises(Invalid):self.s.launch(resumed['id'])

    def test_record_resolution_removes_item_and_changes_context(self):
        record=self.s.record(self.p['id'],'Which outcome matters first?','question','Owner discussion')
        self.assertEqual(self.items()[0]['target_id'],record['id'])
        self.s.resolve_batch([{'project_id':self.p['id'],'record_id':record['id'],'action':'answer','answer':'Prioritize the viewer.'}])
        self.assertFalse(self.items())
        self.assertEqual(self.s.store.get('project',self.p['id'])['records'][0]['answer'],'Prioritize the viewer.')
        self.s.record(self.p['id'],'Agent suggestion, not an owner decision','suggestion','Worker task example')
        self.assertFalse(self.items())

    def test_yolo_edit_and_tampering_require_approval(self):
        plan=self.draft();self.assertEqual(plan['specs'][0]['execution_policy'],'sandboxed')
        self.s.approve(plan['id'],plan['revision'])
        specs=copy.deepcopy(plan['specs']);specs[0]['execution_policy']='yolo'
        edited=self.s.edit_plan(plan['id'],plan['revision'],specs)
        self.assertEqual(edited['state'],'draft')
        with self.assertRaises(Invalid):self.s.launch(plan['id'])
        self.s.approve(plan['id'],edited['revision'])
        forged=self.s.store.get('plan',plan['id']);forged['specs'][0]['execution_policy']='sandboxed';self.s.store.put('plan',forged)
        with self.assertRaises(Invalid):self.s.launch(plan['id'])
        for value in (True,None,'--yolo','full-auto'):
            with self.assertRaises(Invalid):normalized_spec(dict(specs[0],execution_policy=value))
        with self.assertRaises(Invalid):normalized_spec(dict(specs[0],access='read-only'))

    def test_policy_and_handoff_are_retained_on_resume_and_sent_after_launch(self):
        plan=self.draft();specs=copy.deepcopy(plan['specs']);specs[0].update(execution_policy='yolo',time_limit='none')
        plan=self.s.edit_plan(plan['id'],plan['revision'],specs);self.s.approve(plan['id'],plan['revision']);launched=self.s.launch(plan['id']);self.drain()
        task=self.s.store.get('task',launched['task_ids'][0])
        plan=self.s.action(task['id'],'resume','Owner completed the import.')
        spec=plan['specs'][0];self.assertEqual(spec['execution_policy'],'yolo');self.assertEqual(spec['time_limit'],'none')
        edited=copy.deepcopy(plan['specs']);edited[0]['resume_context']={'task_id':'forged'}
        plan=self.s.edit_plan(plan['id'],plan['revision'],edited)
        self.assertEqual(plan['specs'][0]['resume_context']['task_id'],task['id'])
        self.s.approve(plan['id'],plan['revision']);self.s.launch(plan['id']);self.drain()
        prompt=self.adapter.calls[-1]['prompt'];payload=json.loads(prompt.split('\n')[-1])
        self.assertEqual(payload['assignment']['continuation_note'],'Owner completed the import.')
        self.assertEqual(payload['assignment']['execution_policy'],'yolo')
        self.assertIn('CLI commands run without sandboxing',prompt)
        self.assertNotIn('No command network access was approved',prompt)
        self.assertEqual(self.adapter.calls[-1]['session'],task['session_id'])

    def test_resume_refuses_active_work_and_preserves_cleanup_lock_on_error(self):
        task=self.finished();task.update(state='interrupted',recovery_lock=True);self.s.store.put('task',task)
        with self.assertRaises(Invalid):self.s.action(task['id'],'resume')
        self.assertTrue(self.s.store.get('task',task['id'])['recovery_lock'])
        plan=self.s.action(task['id'],'resume',confirmed_stopped=True)
        self.assertIn('resume_session',plan['specs'][0])

    def test_folder_or_cli_change_needs_fresh_session(self):
        task=self.finished();self.s.settings({'model':'different-model'})
        with self.assertRaises(Invalid):self.s.action(task['id'],'resume')
        plan=self.s.action(task['id'],'resume',fresh=True)
        self.assertNotIn('resume_session',plan['specs'][0]);self.assertEqual(plan['specs'][0]['resume_context']['task_id'],task['id'])

    def test_six_slots_run_distinct_workspaces_and_seventh_stays_queued(self):
        self.s.settings({'concurrency':6});self.adapter.hold=True
        for i in range(7):
            cwd=self.root/('workspace-'+str(i));cwd.mkdir()
            project=self.s.project({'name':'Project '+str(i),'goal':'A distinct outcome','cwd':str(cwd)})
            self.s.cancel_project_review(project['id'])
            plan=self.s._draft(project['id'],'Read','fixture',[{'title':'Review','purpose':'Read local files','criteria':['Return findings'],'access':'read-only','expected_outputs':[]}],'fixture')
            self.s.approve(plan['id'],plan['revision']);self.s.launch(plan['id'])
        self.s.tick();self.assertEqual(len(self.s.active),6)
        self.assertEqual(sum(t['state']=='queued' for t in self.s.store.all('task')),1)
        with self.assertRaises(Invalid):self.s.settings({'concurrency':7})
        self.adapter.release.set();self.drain()

    def test_review_item_leaves_queue_only_after_owner_acceptance(self):
        self.adapter.result=copy.deepcopy(test_app.GOOD)
        self.adapter.writer=lambda cwd:(cwd/'research.txt').write_text('Reviewable fixture')
        task=self.finished();self.assertEqual(task['state'],'ready_for_review')
        self.assertEqual(self.items()[0]['group'],'reviews')
        self.s.action(task['id'],'accept','Reviewed fixture output')
        self.assertFalse(self.items());self.assertTrue(self.s.store.get('project',self.p['id'])['accepted_results'])

    def test_six_slots_keep_exclusive_writer_folder_lock(self):
        self.s.settings({'concurrency':6});self.adapter.hold=True
        for _ in range(2):
            plan=self.draft();self.s.approve(plan['id'],plan['revision']);self.s.launch(plan['id'])
        self.s.tick();self.assertEqual(len(self.s.active),1)
        self.assertEqual(sum(t['state']=='queued' for t in self.s.store.all('task')),1)
        self.adapter.release.set();self.drain()

    def test_retried_or_dismissed_coordinator_failure_does_not_keep_requesting_attention(self):
        from cos.attention import attention_queue
        old={'id':'old-call','project_id':self.p['id'],'kind':'conversation','state':'failed','progress':'Reply failed','updated':'2026-10-13T10:00:00Z'}
        self.s.store.put('job',old)
        self.assertEqual(attention_queue(self.s.store)[0]['target_id'],'old-call')
        retry=dict(old,id='retry-call',state='completed');self.s.store.put('job',retry)
        self.assertFalse(attention_queue(self.s.store))
        retry['state']='failed';self.s.store.put('job',retry)
        self.s.stop_job('retry-call')
        self.assertFalse(attention_queue(self.s.store))
        self.assertEqual(self.s.store.get('job','old-call')['state'],'failed')


class AttentionPresentationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'Node is needed for UI checks')
    def test_queue_escapes_text_and_resume_distinguishes_session_from_fresh(self):
        source=Path(__file__).resolve().parents[1]/'static/attention.js'
        script=r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener(){}},renderReview(){},esc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),shortTaskText:x=>String(x),date:x=>x,
 state:{config:{mode:'codex',model:'m',executable:'c',entrypoint:''},capabilities:{resume:true},projects:[{id:'p',cwd:'/a'}],attention:[{id:'task:t',kind:'task',target_id:'t',project_id:'p',project:'P',title:'<script>bad</script>',reason:'<img>',action:'Review',group:'reviews',updated:'now'}]}};
vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
assert.ok(c.renderReview().includes('&lt;script&gt;'));assert.ok(!c.renderReview().includes('<script>'));
const task={state:'blocked',config:{...c.state.config},context:{cwd:'/a'},project_id:'p',session_id:'saved'};
assert.ok(c.resumeWorkHTML(task).includes('captured CLI session'));assert.ok(c.resumeWorkHTML(task).includes('data-task-action="resume"'));
assert.ok(!c.resumeWorkHTML({...task,state:'running'}));
assert.ok(c.resumeWorkHTML({...task,session_id:null}).includes('id="fresh-session" checked'));
'''
        subprocess.run(['node','-e',script,str(source)],check=True,capture_output=True,text=True)
