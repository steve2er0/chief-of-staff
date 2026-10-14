"""Direct agent workflow, isolated workspaces and two-way transport; no model calls."""
import copy
import json
import io
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import test_app
from cos.adapter import CodexAdapter, command_prefix
from cos.agents import git, isolate_workspace
from cos.live_agent import AgentControl, report
from cos.safety import Invalid
from cos.service import Service
from cos.store import uid
from cos.wire import Node, RawJSON, WireRecord, write_json


class AgentManagerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.adapter = test_app.FakeAdapter()
        self.s = Service(self.root / 'data', adapter=self.adapter, start=False, demo_delay=0)
        self.work = self.root / 'work'; self.work.mkdir()
        self.p = self.s.project({'name': 'Agent fixture', 'vision': 'Inspect local fixtures', 'cwd': str(self.work)})

    def tearDown(self):
        self.adapter.release.set()
        self.s.close()
        self.tmp.cleanup()

    def start(self, count=1, **values):
        return self.s.start_agents(dict(project_id=self.p['id'], agents=[{'instructions': 'Inspect fixture '+str(i)} for i in range(count)], isolate=False, **values))

    def drain(self):
        end=time.monotonic()+3
        while time.monotonic()<end:
            self.s.tick()
            if not self.s.active and not any(t['state']=='queued' for t in self.s.store.all('task')):
                return
            time.sleep(.01)
        self.fail('Fixture agents did not finish')

    def test_direct_batch_start_and_retry_do_not_duplicate_agents(self):
        request=uid();raw={'project_id':self.p['id'],'agents':[{'instructions':'Read the files'},{'instructions':'Compare examples'}],'isolate':False}
        first=self.s.start_agents(raw,request)
        self.assertEqual(first['state'],'launched')
        self.assertEqual(first['task_ids'],self.s.start_agents(raw,request)['task_ids'])
        self.assertEqual(len(self.s.store.all('task')),2)
        self.assertTrue(all(t['managed_agent'] and t['config']['timeout_seconds']==0 for t in self.s.store.all('task')))
        self.drain()

    def test_slow_preparation_keeps_snapshots_replies_and_stop_responsive(self):
        self.s.settings({'mode':'codex'})
        entered, release = threading.Event(), threading.Event()
        def prepare(*args):
            entered.set();release.wait(3)
            return None
        with patch('cos.agents.isolate_workspace',side_effect=prepare):
            key=uid();raw={'project_id':self.p['id'],'agents':[{'instructions':'Inspect fixture'}],'isolate':True}
            plan=self.s.start_agents(raw,key);self.s.tick()
            self.assertTrue(entered.wait(1));tid=plan['task_ids'][0]
            self.assertEqual(self.s.start_agents(raw,key)['task_ids'],[tid])
            snapshot=[];reader=threading.Thread(target=lambda:snapshot.append(self.s.snapshot()))
            reader.start();reader.join(.5)
            self.assertFalse(reader.is_alive(),'Preparation held the store lock')
            self.assertEqual(snapshot[0]['tasks'][0]['workspace_preparation'],'preparing')
            self.s.reply_agent(tid,'Keep this queued refinement')
            self.assertEqual(self.s.action(tid,'pause')['state'],'stopping')
            self.assertFalse(self.adapter.calls)
            release.set()
            while self.s.preparations:time.sleep(.005)
            task=self.s.store.get('task',tid)
            self.assertEqual(task['state'],'paused');self.assertFalse(self.adapter.calls)
            self.assertIn('queued refinement',task['continuation_note'])

    def test_planned_start_uses_live_manager_and_keeps_explicit_time_limit(self):
        calls=[]
        def interactive(config,cwd,access,prompt,cancel,update,control,session=None,**options):
            calls.append((config,prompt,control,session))
            update({'session_id':test_app.SID,'initial_sent':True})
            return report('Plain readable planned result','completed',test_app.SID,set())
        self.adapter.run_interactive=interactive
        self.adapter.capabilities['app_server']=True
        self.s.settings({'mode':'codex'})
        plan=self.s.plan(self.p['id'],'Read the fixture','fixture')
        launched=self.s.delegate_now(plan['id'],plan['revision']);self.drain()
        task=self.s.store.get('task',launched['task_ids'][0])
        self.assertTrue(task['managed_agent'] and task['interactive'])
        self.assertEqual(calls[0][0]['timeout_seconds'],0)
        self.assertNotIn('no live reply channel',calls[0][1])
        self.assertEqual(task['result']['summary'],'Plain readable planned result')
        follow=self.s.reply_agent(task['id'],'Explain more')
        self.assertEqual(follow['agent_id'],task['agent_id'])
        self.s.action(follow['id'],'pause')
        self.s.settings({'default_time_limit':'default'})
        bounded=self.s.plan(self.p['id'],'Read again','fixture')
        task_ids=self.s.delegate_now(bounded['id'],bounded['revision'])['task_ids']
        self.assertEqual(self.s.store.get('task',task_ids[0])['config']['timeout_seconds'],900)

    def test_planned_start_checks_cli_automatically_and_runs_native_transport(self):
        fixture=self.root/'planned.py';fixture.write_text(FIXTURE)
        checks=[]
        def help_only(args,**kwargs):
            checks.append(args)
            return subprocess.CompletedProcess(args,0,'codex-cli fixture --config --json --sandbox --model --output-schema --skip-git-repo-check SESSION_ID --listen','')
        adapter=CodexAdapter(runner=help_only,popen=lambda args,**kwargs:subprocess.Popen([sys.executable,'-u',str(fixture),'prose'],**kwargs))
        self.s.adapter=adapter
        self.s.settings({'mode':'codex','executable':sys.executable,'entrypoint':'','model':'fixture'})
        plan=self.s.plan(self.p['id'],'Inspect fixture','fixture')
        started=self.s.delegate_now(plan['id'],plan['revision']);self.drain()
        task=self.s.store.get('task',started['task_ids'][0])
        self.assertEqual(len(checks),5)
        self.assertTrue(task['interactive'] and task['managed_agent'])
        self.assertEqual(task['state'],'ready_for_review')
        self.assertEqual(task['session_id'],test_app.SID)

    def test_reused_item_id_in_a_new_turn_retains_its_own_capture_link(self):
        started=self.start();tid=started['task_ids'][0]
        task=self.s.store.get('task',tid);task['state']='running';self.s.store.put('task',task)
        message={'id':'repeated-item','text':'First turn','capture_name':'first.json'}
        self.s._update(tid,{'agent_message':message})
        task=self.s.store.get('task',tid);task['state']='paused';self.s.store.put('task',task)
        follow=self.s.reply_agent(tid,'Continue',fresh=True)
        follow['state']='running';self.s.store.put('task',follow)
        message.update(text='Next turn',capture_name='second.json')
        self.s._update(follow['id'],{'agent_message':message});self.s._update(follow['id'],{'agent_message':message})
        items=[m for m in self.s.store.get('task',follow['id'])['conversation'] if m['id']=='repeated-item']
        self.assertEqual([m['capture_name'] for m in items],['first.json','second.json'])
        self.assertEqual([m['task_id'] for m in items],[tid,follow['id']])

    def test_large_permission_reply_uses_full_scope_and_capture_download_is_task_scoped(self):
        plan=self.start();tid=plan['task_ids'][0]
        permission={'fileSystem':{'write':['/fixture/'+str(i) for i in range(20000)]}}
        params={'threadId':test_app.SID,'turnId':'turn','permissions':permission,'reason':'x'*(4*1024*1024+1)}
        folder=self.s.data/'outputs'/tid/'wire';folder.mkdir(parents=True)
        path=folder/(uid()+'.json');path.write_text(json.dumps({'id':901,'method':'item/permissions/requestApproval','params':params}))
        record=WireRecord(path);preview=record.root.get('params').preview();record.close()
        task=self.s.store.get('task',tid)
        task.update(state='running',interactive=True,live_requests=[{'id':'901','wire_id':901,'status':'pending','method':'item/permissions/requestApproval','params':preview,'capture_name':path.name}])
        self.s.store.put('task',task);control=AgentControl()
        self.s.active[tid]={'control':control,'cwd':str(self.work),'access':'read-only'}
        try:
            self.assertLess(len(json.dumps(self.s.snapshot())),200000)
            self.assertEqual(self.s.live_capture(tid,path.name),path)
            with self.assertRaises(Invalid):self.s.live_capture(tid,'../other.json')
            self.s.respond_agent(tid,'901',{'decision':'accept'})
            action=control.actions.get_nowait();wire=io.StringIO();write_json(action['response'],wire)
            self.assertEqual(json.loads(wire.getvalue()),{'permissions':permission,'scope':'turn'})
        finally:self.s.active.pop(tid)

    def test_start_new_project_requires_only_instructions_and_optional_folder_in_demo(self):
        plan=self.s.start_agents({'agents':[{'instructions':'Explore a synthetic idea'}]})
        project=self.s.store.get('project',plan['project_id'])
        self.assertEqual(project['vision'],'Explore a synthetic idea')
        self.assertFalse(self.s.store.all('setup_review'))

    def test_unreviewed_results_do_not_block_more_agents(self):
        first=self.start();self.drain()
        tid=first['task_ids'][0]
        self.assertEqual(self.s.store.get('task',tid)['state'],'ready_for_review')
        second=self.start(2);self.drain()
        self.assertEqual(len(second['task_ids']),2)
        self.assertEqual(len([t for t in self.s.store.all('task') if t.get('result')]),3)

    def test_stopped_queued_replies_are_included_in_a_later_continuation(self):
        plan=self.start();task=self.s.store.get('task',plan['task_ids'][0])
        self.s.reply_agent(task['id'],'Keep the queued requirement')
        self.s.action(task['id'],'pause')
        follow=self.s.reply_agent(task['id'],'Also add this refinement',fresh=True)
        self.assertIn('Keep the queued requirement',follow['continuation_note'])
        self.assertIn('Also add this refinement',follow['continuation_note'])

    def test_shared_folder_writers_serialize_but_readers_can_run_together(self):
        self.s.settings({'mode':'codex'});self.adapter.hold=True
        plan=self.start(2);self.s.tick()
        self.assertEqual(len(self.s.active),1)
        self.assertEqual(sum(t['state']=='queued' for t in self.s.store.all('task')),1)
        self.adapter.release.set();self.drain()
        self.adapter.release.clear();self.adapter.hold=True
        self.start(2,access='read-only');self.s.tick()
        self.assertEqual(len(self.s.active),2)

    def test_reply_continues_same_session_without_acceptance_and_keeps_old_result(self):
        plan=self.start();self.drain();old=self.s.store.get('task',plan['task_ids'][0])
        reply=self.s.reply_agent(old['id'],'Explain the comparison')
        self.assertEqual(reply['state'],'queued')
        self.assertEqual(reply['agent_id'],old['agent_id'])
        self.assertEqual(reply['session_id'],old['session_id'])
        retained=self.s.store.get('task',old['id'])
        self.assertEqual(retained['result'],old['result'])
        self.assertEqual(retained['output_links'],old['output_links'])
        self.assertEqual(retained['state'],'superseded')
        self.assertEqual(self.s.store.get('project',self.p['id'])['accepted_results'],[])
        self.drain()

    def test_reply_retries_are_idempotent_and_changes_are_rejected(self):
        plan=self.start();self.drain();tid=plan['task_ids'][0];request=uid()
        result=self.s.reply_agent(tid,'Continue',request)
        self.assertEqual(result['id'],self.s.reply_agent(tid,'Continue',request)['id'])
        with self.assertRaises(Invalid):self.s.reply_agent(tid,'Different instructions',request)
        self.assertEqual(len(self.s.store.all('task')),2)

    def test_start_id_cannot_be_reused_with_changed_instructions(self):
        request=uid();raw={'project_id':self.p['id'],'agents':[{'instructions':'Read fixture'}],'isolate':False}
        self.s.start_agents(raw,request)
        with self.assertRaises(Invalid):self.s.start_agents(dict(raw,agents=[{'instructions':'Edit something else'}]),request)
        self.assertEqual(len(self.s.store.all('task')),1)

    def test_reply_keeps_execution_and_folder_after_defaults_change(self):
        self.s.settings({'mode':'codex','default_execution_policy':'yolo'})
        plan=self.start();self.drain();old=self.s.store.get('task',plan['task_ids'][0])
        self.s.settings({'default_execution_policy':'sandboxed','model':'a-different-model'})
        other=self.root/'other';other.mkdir();self.s.project({'cwd':str(other)},self.p['id'])
        follow=self.s.reply_agent(old['id'],'Continue')
        self.assertEqual(follow['config'],old['config'])
        self.assertEqual(follow['context']['cwd'],str(self.work.resolve()))
        self.assertEqual(follow['execution_policy'],'yolo')
        self.assertEqual(follow['session_id'],old['session_id'])

    def test_interrupted_cleanup_confirmation_is_still_required(self):
        plan=self.start();task=self.s.store.get('task',plan['task_ids'][0])
        task.update(state='interrupted',recovery_lock=True);self.s.store.put('task',task)
        with self.assertRaises(Invalid):self.s.reply_agent(task['id'],'Continue')
        self.assertEqual(len(self.s.store.all('task')),1)
        reply=self.s.reply_agent(task['id'],'Continue',confirmed_stopped=True,fresh=True)
        self.assertFalse(reply.get('recovery_lock'))
        self.assertFalse(self.s.store.get('task',task['id']).get('recovery_lock'))
        self.assertFalse(self.s._locked(reply['context']['cwd'],'workspace-write'))

    def test_reply_while_legacy_cli_runs_is_queued_for_next_turn(self):
        self.s.settings({'mode':'codex'});self.adapter.hold=True
        plan=self.start();self.s.tick();tid=plan['task_ids'][0]
        until=time.monotonic()+2
        while not self.adapter.calls and time.monotonic()<until:time.sleep(.005)
        task=self.s.reply_agent(tid,'Use the smaller example')
        self.assertEqual(task['conversation'][-1]['status'],'queued_next')
        self.adapter.release.set();self.drain()
        tasks=self.s.store.all('task');self.assertEqual(len(tasks),2)
        self.assertEqual(tasks[0]['session_id'],tasks[1]['session_id'])
        self.assertIn('Use the smaller example',self.adapter.calls[-1]['prompt'])

    def test_answer_and_continue_delivers_owner_answer(self):
        plan=self.start();self.drain();tid=plan['task_ids'][0]
        task=self.s.store.get('task',tid)
        task.update(state='running');self.s.store.put('task',task)
        self.s._update(tid,{'user_requests':{'version':1,'revision':1,'state':'needs_user','items':[{'id':'sample','kind':'question','text':'Which sample?'}]}})
        task=self.s.store.get('task',tid);task['state']='blocked';self.s.store.put('task',task)
        record=self.s.store.get('project',self.p['id'])['records'][-1]
        reply=self.s.answer_and_continue(self.p['id'],record['id'],{'answer':'Use sample A'})
        self.assertIn('Use sample A',reply['continuation_note'])
        self.assertEqual(reply['state'],'queued')
        self.assertNotIn('user_requests',reply)
        self.assertEqual(self.s.store.get('project',self.p['id'])['records'][-1]['status'],'answered')

    def test_stale_live_tool_request_cannot_grant_permissions(self):
        plan=self.start();self.drain();tid=plan['task_ids'][0]
        with self.assertRaises(Invalid):self.s.respond_agent(tid,'missing',{'decision':'accept'})

    def test_responses_use_only_the_exact_pending_permission_profile(self):
        plan=self.start();tid=plan['task_ids'][0];task=self.s.store.get('task',tid)
        profile={'network':{'enabled':True}}
        task.update(state='running',interactive=True,live_requests=[{'id':'77','wire_id':77,'status':'pending','method':'item/permissions/requestApproval','params':{'permissions':profile}}])
        self.s.store.put('task',task);control=AgentControl();self.s.active[tid]={'control':control}
        try:
            self.s.respond_agent(tid,'77',{'decision':'accept','permissions':{'fileSystem':{'write':['/']}}})
            action=control.actions.get_nowait()
            self.assertEqual(action['response'],{'permissions':profile,'scope':'turn'})
            with self.assertRaises(Invalid):self.s.respond_agent(tid,'77',{'decision':'accept'})
        finally:self.s.active.pop(tid)

    def test_finished_prose_result_does_not_create_a_mandatory_attention_item(self):
        self.s.settings({'mode':'codex'});self.adapter.result=dict(test_app.GOOD,summary='Useful report',decisions=[])
        plan=self.start(access='read-only');self.drain()
        self.assertEqual(self.s.store.get('task',plan['task_ids'][0])['state'],'ready_for_review')
        self.assertEqual(self.s.snapshot()['attention'],[])


class WorktreeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.source=self.root/'source';self.source.mkdir()
        git(self.source,'init');git(self.source,'config','user.name','Fixture');git(self.source,'config','user.email','fixture@example.invalid')
        (self.source/'tracked.txt').write_text('Initial');git(self.source,'add','.');git(self.source,'commit','-m','Fixture')

    def tearDown(self):self.tmp.cleanup()

    def test_default_agents_edit_source_and_serialize_overlapping_writers(self):
        adapter=test_app.FakeAdapter(hold=True,writer=lambda cwd:(cwd/'tracked.txt').write_text('Agent edit'))
        service=Service(self.root/'data',adapter=adapter,start=False)
        try:
            project=service.project({'vision':'Edit fixture','cwd':str(self.source)})
            service.settings({'mode':'codex'})
            plan=service.start_agents({'project_id':project['id'],'agents':[{'instructions':'Edit one'},{'instructions':'Edit two'}]})
            self.assertFalse(plan['isolate'])
            tasks=service.store.all('task')
            self.assertTrue(all(t['context']['cwd']==str(self.source.resolve()) and not t.get('worktree') and not t.get('workspace_preparation') for t in tasks))
            service.tick()
            end=time.monotonic()+2
            while not adapter.calls and time.monotonic()<end:time.sleep(.005)
            self.assertEqual(len(service.active),1)
            self.assertEqual(len(adapter.calls),1)
            service.tick();self.assertEqual(len(service.active),1)
            adapter.release.set()
            end=time.monotonic()+3
            while (service.active or any(t['state']=='queued' for t in service.store.all('task'))) and time.monotonic()<end:
                service.tick();time.sleep(.005)
            self.assertEqual(len(adapter.calls),2)
            self.assertEqual((self.source/'tracked.txt').read_text(),'Agent edit')
            self.assertTrue(all(t['state']=='ready_for_review' for t in service.store.all('task')))
        finally:adapter.release.set();service.close()

    def test_worktree_preference_can_be_overridden_at_start(self):
        service=Service(self.root/'data',adapter=test_app.FakeAdapter(),start=False)
        try:
            project=service.project({'vision':'Edit fixture','cwd':str(self.source)})
            service.settings({'mode':'codex','default_isolate':True})
            raw={'project_id':project['id'],'agents':[{'instructions':'Edit fixture'}]}
            isolated=service.start_agents(raw)
            self.assertTrue(isolated['isolate'])
            self.assertEqual(service.store.get('task',isolated['task_ids'][0])['workspace_preparation'],'pending')
            direct=service.start_agents(dict(raw,isolate=False))
            self.assertFalse(direct['isolate'])
            self.assertNotIn('workspace_preparation',service.store.get('task',direct['task_ids'][0]))
        finally:service.close()

    def test_independent_worktrees_include_dirty_inputs_and_leave_source_unchanged(self):
        (self.source/'tracked.txt').write_text('Owner edit')
        (self.source/'new-input.txt').write_text('Untracked owner input')
        before=git(self.source,'status','--porcelain').stdout
        first=isolate_workspace(str(self.source),self.root/'first','codex/fixture-one')
        second=isolate_workspace(str(self.source),self.root/'second','codex/fixture-two')
        for tree in (first,second):
            self.assertEqual((Path(tree['cwd'])/'tracked.txt').read_text(),'Owner edit')
            self.assertEqual((Path(tree['cwd'])/'new-input.txt').read_text(),'Untracked owner input')
        (Path(first['cwd'])/'tracked.txt').write_text('First agent edit')
        self.assertEqual((self.source/'tracked.txt').read_text(),'Owner edit')
        self.assertEqual((Path(second['cwd'])/'tracked.txt').read_text(),'Owner edit')
        self.assertEqual(git(self.source,'status','--porcelain').stdout,before)

    def test_non_git_folder_uses_shared_folder_without_fabricating_isolation(self):
        plain=self.root/'plain';plain.mkdir()
        self.assertIsNone(isolate_workspace(str(plain),self.root/'unused','codex/unused'))
        self.assertFalse((self.root/'unused').exists())

    def test_declared_ignored_file_and_folder_inputs_are_carried_without_other_secrets(self):
        (self.source/'.gitignore').write_text('samples/\nprivate.env\n')
        folder=self.source/'samples';folder.mkdir()
        (folder/'input.csv').write_text('x,y\n1,2\n')
        (folder/'other.csv').write_text('x,y\n3,4\n')
        (self.source/'private.env').write_text('DO_NOT_COPY=fixture')
        before=git(self.source,'status','--porcelain').stdout
        one=isolate_workspace(str(self.source),self.root/'selected-file','codex/selected-file',['samples/input.csv'])
        self.assertEqual((Path(one['cwd'])/'samples/input.csv').read_bytes(),(folder/'input.csv').read_bytes())
        self.assertFalse((Path(one['cwd'])/'samples/other.csv').exists())
        self.assertFalse((Path(one['cwd'])/'private.env').exists())
        all_inputs=isolate_workspace(str(self.source),self.root/'selected-folder','codex/selected-folder',['samples'])
        self.assertTrue((Path(all_inputs['cwd'])/'samples/other.csv').exists())
        self.assertFalse((Path(all_inputs['cwd'])/'private.env').exists())
        self.assertEqual(git(self.source,'status','--porcelain').stdout,before)

    def test_declared_input_cannot_follow_an_ignored_link_outside_the_project(self):
        (self.source/'.gitignore').write_text('samples/\n')
        folder=self.source/'samples';folder.mkdir()
        outside=self.root/'outside.txt';outside.write_text('Original')
        (folder/'input.csv').symlink_to(outside)
        destination=self.root/'rejected-input'
        with self.assertRaises(Invalid):
            isolate_workspace(str(self.source),destination,'codex/rejected-input',['samples/input.csv'])
        self.assertFalse(destination.exists());self.assertEqual(outside.read_text(),'Original')

    def test_batch_writers_run_concurrently_in_managed_worktrees(self):
        adapter=test_app.FakeAdapter(hold=True)
        service=Service(self.root/'data',adapter=adapter,start=False)
        try:
            project=service.project({'vision':'Edit fixture','cwd':str(self.source)})
            service.settings({'mode':'codex'})
            plan=service.start_agents({'project_id':project['id'],'agents':[{'instructions':'Edit one'},{'instructions':'Edit two'}],'isolate':True})
            end=time.monotonic()+3
            while len(service.active)<2 and time.monotonic()<end:
                service.tick();time.sleep(.005)
            self.assertEqual(len(service.active),2)
            tasks=service.store.all('task');self.assertNotEqual(tasks[0]['context']['cwd'],tasks[1]['context']['cwd'])
            self.assertTrue(all(t['worktree'] for t in tasks))
        finally:adapter.release.set();service.close()

    def test_planned_fresh_continuation_keeps_edits_and_folder_change_preserves_old_checkout(self):
        adapter=test_app.FakeAdapter()
        adapter.writer=lambda cwd:(cwd/'research.txt').write_text('Retained agent edit')
        service=Service(self.root/'data',adapter=adapter,start=False)
        def drain():
            end=time.monotonic()+3
            while time.monotonic()<end:
                service.tick()
                if not service.active and not any(t['state']=='queued' for t in service.store.all('task')):return
                time.sleep(.005)
            self.fail('Continuation did not finish')
        try:
            project=service.project({'vision':'Edit fixture','cwd':str(self.source)})
            service.settings({'mode':'codex'})
            started=service.start_agents({'project_id':project['id'],'agents':[{'instructions':'Edit fixture'}],'isolate':True})
            drain();original=service.store.get('task',started['task_ids'][0]);old_folder=Path(original['context']['cwd'])
            (old_folder/'kept.txt').write_text('Do not discard prior work')
            revised=service.action(original['id'],'resume','Continue with a fresh session',fresh=True)
            launched=service.delegate_now(revised['id'],revised['revision']);drain()
            continued=service.store.get('task',launched['task_ids'][0])
            self.assertEqual(continued['agent_id'],original['agent_id'])
            self.assertEqual(continued['context']['cwd'],original['context']['cwd'])
            self.assertEqual((old_folder/'kept.txt').read_text(),'Do not discard prior work')
            other=self.root/'other';other.mkdir()
            service.project({'cwd':str(other)},project['id'])
            moved=service.action(continued['id'],'resume','Use the other project folder',fresh=True)
            moved=service.delegate_now(moved['id'],moved['revision']);drain()
            self.assertEqual(Path(service.store.get('task',moved['task_ids'][0])['context']['cwd']),other.resolve())
            self.assertEqual((old_folder/'kept.txt').read_text(),'Do not discard prior work')
        finally:service.close()


# Local protocol fixture, not Codex or a paid model. Exercise real stdin/stdout pipes.
FIXTURE = r'''
import json,sys
from pathlib import Path
SID='12345678-1234-4234-8234-123456789abc'
TURN='fixture-turn'
mode=sys.argv[1]
def emit(value):print(json.dumps(value),flush=True)
def notify(method,params):emit({'method':method,'params':dict(threadId=SID,**params)})
def finish(text):
 notify('item/completed',{'turnId':TURN,'item':{'id':'answer','type':'agentMessage','text':text,'phase':'final_answer'}})
 notify('turn/completed',{'turn':{'id':TURN,'status':'completed','items':[]}})
for line in sys.stdin:
 v=json.loads(line);method=v.get('method');p=v.get('params',{});i=v.get('id')
 if method=='initialize':emit({'id':i,'result':{'userAgent':'fixture'}})
 elif method in ('thread/start','thread/resume'):
  emit({'id':i,'result':{'thread':{'id':('22345678-1234-4234-8234-123456789abc' if mode=='wrong-session' else SID)}}})
 elif method=='turn/start':
  emit({'id':i,'result':{'turn':{'id':TURN,'status':'inProgress','items':[]}}})
  if mode=='question':emit({'id':901,'method':'item/tool/requestUserInput','params':{'threadId':SID,'turnId':TURN,'itemId':'q','isBlocking':True,'questions':[{'id':'sample','header':'Sample','question':'Which sample?'}]}})
  elif mode=='permission':emit({'id':901,'method':'item/commandExecution/requestApproval','params':{'threadId':SID,'turnId':TURN,'itemId':'cmd','command':'read fixture','reason':'Fixture permission','startedAtMs':0}})
  elif mode=='prose':
   Path('result.txt').write_text('Synthetic delivered file')
   notify('item/completed',{'turnId':TURN,'item':{'id':'file','type':'fileChange','status':'completed','changes':[{'path':str(Path('result.txt').resolve()),'kind':{'type':'add'}}]}})
   finish('Changes: Saved fixture.\nChecks: fixture check passed.\nLimits: no real model.')
 elif method=='turn/steer':
  emit({'id':i,'result':{'turnId':TURN}})
  finish('Received follow-up: '+p['input'][0]['text'])
 elif method=='turn/interrupt':
  emit({'id':i,'result':{}});notify('turn/completed',{'turn':{'id':TURN,'status':'interrupted','items':[]}})
 elif i==901 and 'result' in v:
  notify('serverRequest/resolved',{'requestId':901})
  finish('Owner response received: '+json.dumps(v['result']))
'''


class LiveTransportTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.fixture=self.root/'fixture.py';self.fixture.write_text(FIXTURE)
        self.config={'executable':sys.executable,'entrypoint':'','model':'fixture','timeout_seconds':30,'_capture_dir':str(self.root/'captures')}
        self.updates=[];self.control=AgentControl();self.cancel=threading.Event()

    def tearDown(self):self.tmp.cleanup()

    def run_fixture(self,mode,hook=None,session=None):
        adapter=CodexAdapter(popen=lambda args,**kwargs:subprocess.Popen([sys.executable,'-u',str(self.fixture),mode],**kwargs))
        adapter.capabilities={'ok':True,'app_server':True,'prefix':command_prefix(self.config)}
        def update(value):
            self.updates.append(value)
            if hook:hook(value)
        return adapter.run_interactive(self.config,str(self.root),'workspace-write','Synthetic instructions',self.cancel,update,self.control,session)

    def test_completed_prose_and_file_events_are_valid_results(self):
        result=self.run_fixture('prose')
        self.assertEqual(result['status'],'completed')
        self.assertTrue(result['execution_verified'])
        self.assertIn('result.txt',result['artifacts'])
        self.assertIn('fixture check passed',result['summary'])
        self.assertNotIn('handoff_issues',result)

    def test_question_over_four_mib_is_preserved_and_can_be_answered(self):
        self.fixture.write_text(FIXTURE.replace("'Which sample?'", "'Which sample?' + 'x'*(4*1024*1024+1)"))
        def answer(value):
            request=value.get('live_request')
            if request:
                self.assertLess(len(request['params']['questions'][0]['question']),10000)
                captured=self.root/'captures'/request['capture_name']
                self.assertGreater(captured.stat().st_size,4*1024*1024)
                full=json.loads(captured.read_text())
                self.assertGreater(len(full['params']['questions'][0]['question']),4*1024*1024)
                self.control.submit({'kind':'response','wire_id':request['wire_id'],'message_id':'answer','response':{'answers':{'sample':{'answers':['sample A']}}}})
        result=self.run_fixture('question',answer)
        self.assertEqual(result['status'],'completed');self.assertIn('sample A',result['summary'])
        self.assertTrue(any(v.get('live_request') for v in self.updates))

    def test_report_over_four_mib_has_bounded_preview_and_exact_download(self):
        self.fixture.write_text(FIXTURE.replace("'Changes: Saved fixture.\\nChecks: fixture check passed.\\nLimits: no real model.'", "'Large report: ' + 'x'*(4*1024*1024+1) + '\\nLast line: preserved.'"))
        result=self.run_fixture('prose')
        self.assertEqual(result['status'],'completed');self.assertTrue(result['execution_verified'])
        self.assertTrue(result['report_truncated']);self.assertLess(len(result['agent_report']),10000)
        full=Path(result['agent_report_file']).read_text()
        self.assertGreater(len(full),4*1024*1024);self.assertTrue(full.endswith('Last line: preserved.'))
        self.assertIn('result.txt',result['artifacts'])

    def test_mid_turn_reply_has_a_delivery_receipt(self):
        self.control.submit({'kind':'message','text':'Use sample B','message_id':'reply'})
        result=self.run_fixture('steer')
        self.assertEqual(result['status'],'completed')
        self.assertIn('Use sample B',result['summary'])
        self.assertTrue(any(v.get('delivery')=={'id':'reply','status':'delivered','error':''} for v in self.updates))

    def test_live_question_response_unblocks_the_exact_request(self):
        def answer(value):
            if value.get('live_request'):
                self.control.submit({'kind':'response','wire_id':901,'message_id':'reply','response':{'answers':{'sample':{'answers':['sample A']}}}})
        result=self.run_fixture('question',answer)
        self.assertEqual(result['status'],'completed')
        self.assertIn('sample A',result['summary'])
        self.assertTrue(any(v.get('live_request_resolved')=='901' for v in self.updates))

    def test_permission_requires_an_explicit_response(self):
        def answer(value):
            if value.get('live_request'):
                self.assertEqual(value['live_request']['status'],'pending')
                self.control.submit({'kind':'response','wire_id':901,'message_id':'reply','response':{'decision':'decline'}})
        result=self.run_fixture('permission',answer)
        self.assertIn('decline',result['summary'])

    def test_resume_cannot_accept_a_different_session(self):
        result=self.run_fixture('wrong-session',session=test_app.SID)
        self.assertEqual(result['status'],'failed')
        self.assertIn('does not match',result['connection_error'])

    def test_cancel_ends_the_process_and_keeps_session_identity(self):
        def stop(value):
            if value.get('turn_id'):self.cancel.set()
        result=self.run_fixture('steer',stop)
        self.assertEqual(result['status'],'cancelled')
        self.assertEqual(result['session_id'],test_app.SID)

    def test_closed_control_does_not_accept_silent_new_messages(self):
        self.control.close()
        self.assertFalse(self.control.submit({'kind':'message','text':'late','message_id':'late'}))

    def test_prose_file_links_are_captured_without_reading_outside_the_project(self):
        (self.root/'table.csv').write_text('x,y\n1,2')
        (self.root/'notes.txt').write_text('Fixture notes')
        result=report('Saved [table](table.csv) and `notes.txt`. Outside [file](/etc/hosts).','completed',test_app.SID,set(),str(self.root))
        self.assertEqual(set(result['artifacts']),{'table.csv','notes.txt'})

    def test_unacknowledged_steer_is_uncertain_and_never_reported_delivered(self):
        self.fixture.write_text(FIXTURE.replace("emit({'id':i,'result':{'turnId':TURN}})","pass # Intentionally omit the acceptance receipt"))
        self.control.submit({'kind':'message','text':'Uncertain reply','message_id':'reply'})
        result=self.run_fixture('steer')
        self.assertEqual(result['status'],'completed')
        statuses=[v['delivery']['status'] for v in self.updates if v.get('delivery',{}).get('id')=='reply']
        self.assertEqual(statuses,['uncertain'])

    def test_unsent_reply_at_turn_end_is_queued_for_next_turn(self):
        self.fixture.write_text(FIXTURE.replace("emit({'id':i,'result':{'turnId':TURN}})","pass # No receipt after completion"))
        def late(value):
            if value.get('agent_message'):
                self.control.submit({'kind':'message','text':'Late reply','message_id':'late'})
        result=self.run_fixture('prose',late)
        self.assertEqual(result['status'],'completed')
        self.assertTrue(any(v.get('delivery',{}).get('id')=='late' and v['delivery']['status'] in ('uncertain','queued_next') for v in self.updates))

    def test_rejected_steer_receipt_after_turn_completion_queues_a_continuation(self):
        self.fixture.write_text(FIXTURE.replace("emit({'id':i,'result':{'turnId':TURN}})","emit({'id':i,'error':{'code':-32000,'message':'No active turn'}})"))
        def late(value):
            if value.get('agent_message'):
                self.control.submit({'kind':'message','text':'Continue after finish','message_id':'late'})
        result=self.run_fixture('prose',late)
        self.assertEqual(result['status'],'completed')
        statuses=[v['delivery']['status'] for v in self.updates if v.get('delivery',{}).get('id')=='late']
        self.assertEqual(statuses,['queued_next'])


class AgentHTTPTests(unittest.TestCase):
    setUp=test_app.HTTPTests.setUp
    tearDown=test_app.HTTPTests.tearDown
    request=test_app.HTTPTests.request

    def test_full_capture_download_requires_authentication_and_exact_task_reference(self):
        plan=self.s.start_agents({'agents':[{'instructions':'Fixture capture'}],'isolate':False})
        tid=plan['task_ids'][0];task=self.s.store.get('task',tid)
        folder=self.s.data/'outputs'/tid/'wire';folder.mkdir(parents=True)
        name=uid()+'.json';data=b'Full wire fixture '+b'x'*(4*1024*1024+1);(folder/name).write_bytes(data)
        task['conversation'].append({'id':uid(),'role':'agent','text':'Preview','capture_name':name})
        self.s.store.put('task',task)
        path='/api/agent-capture/'+tid+'/'+name
        status,body,headers=self.request(path)
        self.assertEqual(status,200);self.assertEqual(body,data)
        self.assertEqual(int(headers['Content-Length']),len(data))
        self.assertEqual(self.request(path,auth=False)[0],401)
        self.assertEqual(self.request('/api/agent-capture/'+tid+'/unreferenced.json')[0],400)
        self.assertEqual(self.request('/api/agent-capture/'+tid+'/%2E%2E%2Fother.json')[0],400)

    def test_slow_action_does_not_block_other_requests_and_retries_run_once(self):
        entered, release = threading.Event(), threading.Event()
        calls=[];responses=[];key=uid()
        def preflight():
            calls.append(True);entered.set();release.wait(2)
            return {'ok':True}
        with patch.object(self.s,'preflight',side_effect=preflight):
            first=threading.Thread(target=lambda:responses.append(self.request('/api/preflight',{},reqid=key)))
            retry=threading.Thread(target=lambda:responses.append(self.request('/api/preflight',{},reqid=key)))
            first.start();self.assertTrue(entered.wait(1));retry.start()
            independent=[]
            other=threading.Thread(target=lambda:independent.append(self.request('/api/start-agents',{'agents':[{'instructions':'Read fixture'}],'isolate':False})))
            other.start();other.join(.5)
            try:
                self.assertFalse(other.is_alive(),'An unrelated request waited behind the slow action')
                self.assertEqual(independent[0][0],200)
            finally:
                release.set();first.join();retry.join();other.join()
            self.assertEqual(len(calls),1)
            self.assertEqual(responses[0][1],responses[1][1])

    def test_start_reply_and_results_are_available_through_authenticated_routes(self):
        raw={'agents':[{'instructions':'Read one'},{'instructions':'Read two'}],'isolate':False}
        request=uid();status,body,_=self.request('/api/start-agents',raw,reqid=request)
        self.assertEqual(status,200)
        first=json.loads(body);self.assertEqual(len(first['task_ids']),2)
        self.assertEqual(self.request('/api/start-agents',raw,reqid=request)[1],body)
        status,body,_=self.request('/api/agent-reply',{'id':first['task_ids'][0],'text':'Also read three'})
        self.assertEqual(status,200)
        self.assertIn('Also read three',json.loads(body)['continuation_note'])
        self.assertEqual(self.request('/agents.js')[0],200)
        self.assertEqual(self.request('/api/start-agents',raw,auth=False)[0],401)


class AgentPresentationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node is needed for presentation checks')
    def test_board_groups_sessions_results_sort_by_completion_and_tool_text_is_escaped(self):
        root=Path(__file__).resolve().parents[1]
        script=r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener:()=>{}},setInterval:()=>{},planModal:()=>{},boardFilter:'',
 esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 AgentModel:require(process.argv[3]),projectName:()=> 'Fixture',stateName:x=>x.replaceAll('_',' '),date:x=>x,state:{tasks:[],projects:[]}};
vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),c);
c.state.tasks=[{id:'first',agent_id:'a',state:'superseded',finished_at:'2026-10-13T10:00:00Z',result:{summary:'Earlier work'}},
 {id:'second',agent_id:'b',state:'ready_for_review',finished_at:'2026-10-13T12:00:00Z',result:{summary:'Latest finished work'}},
 {id:'third',agent_id:'a',state:'ready_for_review',finished_at:'2026-10-13T11:00:00Z',result:{summary:'Next turn'}}];
assert.deepEqual(Array.from(vm.runInContext('currentAgents().map(t=>t.id)',c)),['third','second']);
assert.deepEqual(Array.from(vm.runInContext('collectedResults().map(t=>t.id)',c)),['second','third','first']);
c.t={id:'task',state:'running',live_requests:[{id:'77',status:'pending',method:'item/commandExecution/requestApproval',params:{command:'<script>secret</script>',reason:'Need permission'}}]};
const html=vm.runInContext('liveRequestsHTML(t)',c);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
assert.equal(c.AgentModel.status({state:'queued',workspace_preparation:'preparing'}),'Preparing');
c.t={id:'large',state:'ready_for_review',managed_agent:true,config:{mode:'codex'},result:{summary:'Report preview',report_truncated:true},output_links:[{name:'agent-report.txt',label:'Original report',sha256:'abc'}]};
assert.ok(vm.runInContext('resultHandoffHTML(t)',c).includes('/api/output/large/agent-report.txt'));
c.t={id:'questions',state:'running',live_requests:[{id:'bulk',status:'pending',method:'item/tool/requestUserInput',questions_omitted:true,has_secret_questions:true,capture_name:'full.json',params:{questions:[]}}]};
const bulk=vm.runInContext('liveRequestsHTML(t)',c);assert.ok(bulk.includes('data-agent-answers-json'));assert.ok(bulk.includes('type="password"'));assert.ok(bulk.includes('Download the full request'));
c.summary='Changes: Saved plot.\nChecks: Core tests passed.\nLimits: No measured comparison.\nNext action: Inspect the plot.';
const sections=vm.runInContext('resultSections(summary)',c);assert.equal(sections.next,'Inspect the plot.');assert.equal(sections.limits,'No measured comparison.');
'''
        result=subprocess.run([shutil.which('node'),'-e',script,str(root/'static/task-feedback.js'),str(root/'static/agents.js'),str(root/'static/agent-model.js')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
