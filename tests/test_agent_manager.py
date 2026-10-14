"""Direct agent workflow, isolated workspaces and two-way transport; no model calls."""
import copy
import json
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import threading
import time
import unittest

import test_app
from cos.adapter import CodexAdapter, command_prefix
from cos.agents import git, isolate_workspace
from cos.live_agent import AgentControl, report
from cos.safety import Invalid
from cos.service import Service
from cos.store import uid


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

    def test_batch_writers_run_concurrently_in_managed_worktrees(self):
        adapter=test_app.FakeAdapter(hold=True)
        service=Service(self.root/'data',adapter=adapter,start=False)
        try:
            project=service.project({'vision':'Edit fixture','cwd':str(self.source)})
            service.settings({'mode':'codex'})
            plan=service.start_agents({'project_id':project['id'],'agents':[{'instructions':'Edit one'},{'instructions':'Edit two'}]})
            service.tick();self.assertEqual(len(service.active),2)
            tasks=service.store.all('task');self.assertNotEqual(tasks[0]['context']['cwd'],tasks[1]['context']['cwd'])
            self.assertTrue(all(t['worktree'] for t in tasks))
        finally:adapter.release.set();service.close()


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
        self.config={'executable':sys.executable,'entrypoint':'','model':'fixture','timeout_seconds':5}
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
c.summary='Changes: Saved plot.\nChecks: Core tests passed.\nLimits: No measured comparison.\nNext action: Inspect the plot.';
const sections=vm.runInContext('resultSections(summary)',c);assert.equal(sections.next,'Inspect the plot.');assert.equal(sections.limits,'No measured comparison.');
'''
        result=subprocess.run([shutil.which('node'),'-e',script,str(root/'static/task-feedback.js'),str(root/'static/agents.js'),str(root/'static/agent-model.js')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
