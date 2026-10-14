"""Discussion handoffs and run-scoped conversation history; no model calls."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import unittest

import test_agent_manager
import test_app
from cos.results import MISSING_FILES_ISSUE, result_presentation


class DiscussionHandoffTests(unittest.TestCase):
    setUp = test_agent_manager.AgentManagerTests.setUp
    tearDown = test_agent_manager.AgentManagerTests.tearDown
    start = test_agent_manager.AgentManagerTests.start
    drain = test_agent_manager.AgentManagerTests.drain

    def test_edit_permission_does_not_require_files_for_a_discussion_reply(self):
        self.s.settings({'mode': 'codex'})
        self.adapter.result = dict(test_app.GOOD, summary='Consider a smaller control panel.', artifacts=[])
        plan = self.start(access='workspace-write')
        self.drain()
        task = self.s.store.get('task', plan['task_ids'][0])
        self.assertEqual(task['state'], 'ready_for_review')
        self.assertEqual(task['expected_outputs'], [])
        self.assertEqual(task['result']['delivery_kind'], 'reply')
        self.assertEqual(task['handoff_issues'], [])
        self.assertEqual(task['delivery_status'], 'complete')
        self.assertIn('Consider a smaller control panel.', self.s.output(task['id'], 'agent-report.txt').read_text())

    def test_a_promised_missing_file_still_needs_attention(self):
        self.s.settings({'mode': 'codex'})
        self.adapter.result = dict(test_app.GOOD, artifacts=['missing.svg'])
        plan = self.start(access='workspace-write')
        self.drain()
        task = self.s.store.get('task', plan['task_ids'][0])
        self.assertEqual(task['result']['delivery_kind'], 'files')
        self.assertEqual(task['delivery_status'], 'partial')
        self.assertTrue(any('Could not capture missing.svg' in x for x in task['handoff_issues']))

    def test_snapshot_corrects_only_legacy_false_warning_without_rewriting_history(self):
        plan = self.start()
        task = self.s.store.get('task', plan['task_ids'][0])
        task.update(state='ready_for_review', result=dict(test_app.GOOD, handoff_issues=[MISSING_FILES_ISSUE]),
                    handoff_issues=[MISSING_FILES_ISSUE], snapshot_limits=[MISSING_FILES_ISSUE], delivery_status='partial')
        self.s.store.put('task', task)
        original = copy.deepcopy(self.s.store.get('task', task['id']))
        view = next(x for x in self.s.snapshot()['tasks'] if x['id'] == task['id'])
        self.assertEqual(view['handoff_issues'], [])
        self.assertEqual(view['result']['delivery_kind'], 'reply')
        self.assertEqual(view['delivery_status'], 'complete')
        self.assertEqual(self.s.store.get('task', task['id']), original)
        original['handoff_issues'].append('Could not save the report download: disk unavailable')
        original['result']['agent_report'] = json.dumps(test_app.GOOD)
        before = copy.deepcopy(original)
        view = result_presentation(original)
        self.assertEqual(len(view['handoff_issues']), 1)
        self.assertIn('disk unavailable', view['handoff_issues'][0])
        self.assertEqual(view['delivery_status'], 'partial')
        self.assertEqual(original, before)
        for declared in ({'expected_outputs': ['required.svg']}, {'result': dict(test_app.GOOD, artifacts=['missing.svg'])}):
            promised = dict(before, **declared)
            self.assertIs(result_presentation(promised), promised)


class AgentPanelPresentationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node is needed for presentation checks')
    def test_start_summary_reports_selected_permissions_and_duration(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener(){}},setInterval(){},planModal(){}};vm.createContext(c);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
c.values={access:'workspace-write',execution_policy:'yolo',time_limit:'none',research_access:true,isolate:false};
const presentation=()=>vm.runInContext('startAgentExecution(values,900)',c);
assert.ok(presentation().summary.includes('Full access (YOLO)'));
assert.ok(presentation().summary.includes('Until finished or stopped'));
c.values.execution_policy='sandboxed';c.values.time_limit='default';
assert.ok(presentation().summary.includes('Sandboxed'));assert.ok(!presentation().summary.includes('YOLO'));
assert.ok(presentation().summary.includes('15 min'));assert.ok(presentation().summary.includes('Network allowed'));
c.values.isolate=true;assert.ok(presentation().footer.includes('separate checkouts'));
c.values.access='read-only';
assert.ok(presentation().summary.includes('Read-only'));assert.ok(!presentation().summary.includes('Network allowed'));
assert.ok(presentation().footer.includes('no project edits'));assert.ok(!presentation().footer.includes('Edits go'));
c.values.execution_policy='yolo';assert.ok(!presentation().summary.includes('YOLO'));
c.values.time_limit='default';assert.ok(vm.runInContext('startAgentExecution(values,95).summary',c).includes('95 sec'));
'''
        run = subprocess.run(['node', '-e', script, str(root/'static/agents.js')], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

    @unittest.skipUnless(shutil.which('node'), 'Node is needed for presentation checks')
    def test_details_preserve_run_scope_permissions_and_session_choices(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const model=require(process.argv[1]),c={AgentModel:model,document:{addEventListener(){}},setInterval(){},planModal(){},
 state:{tasks:[]},esc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),date:x=>x,stateName:x=>x};
vm.createContext(c);for(const path of process.argv.slice(2))vm.runInContext(fs.readFileSync(path,'utf8'),c);
const t={id:'current',agent_id:'crew',created:'2026-10-14T10:00:00Z',state:'ready_for_review',
 purpose:'Original assignment with <exact> instructions.',continuation_note:'Follow-up for this run.',
 context:{cwd:'/captured/checkout'},worktree:{source_cwd:'/project/OriginalProject',branch:'codex/captured'},
 config:{mode:'codex',model:'captured-model',timeout_seconds:0},access:'workspace-write',execution_policy:'yolo',
 session_id:'saved-session',conversation:[{role:'user',text:'Latest request <keep exact>.',at:'2026-10-14T10:01:00Z',status:'queued_next'}],
 history:[...Array.from({length:14},(_,i)=>({at:String(i),text:'Meaningful activity '+i})),
 {at:'15',text:'commandExecution: completed'},{at:'16',text:'commandExecution: failed'}]};
c.task=t;c.state.tasks=[t];const before=JSON.stringify(t),html=vm.runInContext('agentDetailsHTML(task)',c);
assert.equal(vm.runInContext('agentCurrentRequest(task).text',c),'Latest request <keep exact>.');
assert.equal(vm.runInContext('agentCurrentRequest(task).status',c),'queued_next');
const visible=html.split('<div class="agent-details-extra">')[0];
assert.ok(visible.includes('Latest request &lt;keep exact&gt;.'));assert.ok(visible.includes('Queued for next run'));
assert.ok(visible.includes('OriginalProject'));assert.ok(visible.includes('Run used a separate checkout'));
assert.ok(visible.includes('Full access (YOLO)'));
for(const value of ['saved-session','captured-model','/captured/checkout','codex/captured','Original assignment'])assert.ok(!visible.includes(value));
assert.ok(html.includes('Original assignment with &lt;exact&gt; instructions.'));
assert.ok(html.includes('Follow-up for this run.'));assert.ok(html.includes('/captured/checkout'));
assert.ok(html.includes('Copy session ID'));assert.ok(!html.includes('name="fresh"'));assert.ok(!/<details[^>]*\sopen[\s>]/.test(html));
const recent=vm.runInContext('agentRecentActivity(task)',c);assert.equal(recent.length,8);
assert.equal(recent.at(-1).text,'Command failed');assert.ok(!recent.some(x=>x.text==='commandExecution: completed'));
assert.ok(html.includes('commandExecution: completed'));assert.equal(JSON.stringify(t),before);
const signature=vm.runInContext('agentDetailsSignature(task)',c);
t.conversation.push({role:'agent',text:'Unrelated progress',at:'2026-10-14T10:02:00Z'});
assert.equal(vm.runInContext('agentDetailsSignature(task)',c),signature);
t.research_access=true;assert.notEqual(vm.runInContext('agentDetailsSignature(task)',c),signature);
assert.equal(vm.runInContext('agentFreshSession(task)',c),false);
vm.runInContext('agentSessionChoices.set(task.id,true)',c);
assert.equal(vm.runInContext('agentFreshSession(task)',c),true);
assert.ok(vm.runInContext('replyComposerHTML(task)',c).includes('Continue options · New session'));
assert.ok(vm.runInContext('agentReplyHelp(task)',c).includes('New session next run'));
vm.runInContext('agentSessionChoices.set(task.id,false)',c);
assert.equal(vm.runInContext('agentFreshSession(task)',c),false);
t.session_id=null;assert.equal(vm.runInContext('agentFreshSession(task)',c),true);
assert.ok(vm.runInContext('replyComposerHTML(task)',c).includes('No saved session is available'));
t.state='stopping';assert.equal(vm.runInContext('agentFreshSession(task)',c),false);
assert.ok(vm.runInContext('replyComposerHTML(task)',c).includes('class="agent-continue-options" hidden'));
t.state='running';assert.equal(vm.runInContext('agentFreshSession(task)',c),false);
t.execution_policy='sandboxed';t.access='read-only';assert.equal(vm.runInContext('agentAccess(task)',c),'Read-only');
t.access='workspace-write';assert.equal(vm.runInContext('agentAccess(task)',c),'Edit project files · Sandboxed');
t.state='superseded';t.finished_at='2026-10-14T10:01:30Z';
t.conversation.push({role:'user',text:'Belongs to a later run',at:'2026-10-14T10:02:00Z',status:'delivered'});
assert.equal(vm.runInContext('agentCurrentRequest(task).text',c),'Latest request <keep exact>.');
c.task={...t,id:'windows',state:'paused',context:{cwd:'C:\\Projects\\Lunar'},worktree:null,conversation:[],continuation_note:''};
assert.ok(vm.runInContext('agentDetailsHTML(task)',c).split('<div class="agent-details-extra">')[0].includes('Lunar'));
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(root/'static/agent-model.js'),
                                 str(root/'static/task-feedback.js'), str(root/'static/agents.js')],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('node'), 'Node is needed for presentation checks')
    def test_results_keep_saved_outcomes_and_extract_only_explicit_safe_previews(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const model=require(process.argv[1]),c={AgentModel:model,URL,document:{addEventListener(){}},setInterval(){},planModal(){},
 boardFilter:'',currentModal:null,state:{tasks:[],projects:[]},projectName:()=> 'Fixture',date:x=>x,stateName:x=>x,
 esc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))};
vm.createContext(c);for(const path of process.argv.slice(2))vm.runInContext(fs.readFileSync(path,'utf8'),c);
const a={id:'a',agent_id:'crew',state:'superseded',prior_state:'ready_for_review',finished_at:'2026-10-14T01:00:00Z',title:'Restyle the engine visualization',config:{mode:'codex'},
 result:{status:'completed',summary:'Engine view compacted.\n\nAll **165 tests pass**.\n\nThe [updated preview](http://localhost:4178/view) is ready.',artifacts:['docs/view.jpg']},output_links:[{name:'image',source_path:'docs/view.jpg',sha256:'secret-hash-for-integrity'}]};
const b={...a,id:'b',state:'running',parent_task_id:'a',result:null,output_links:[]};c.state.tasks=[a,b];c.task=a;
assert.equal(model.resultStatus(a).label,'Completed');assert.equal(model.resultStatus({...a,result:{status:'cancelled'}}).label,'Stopped');
assert.equal(model.resultStatus({...a,handoff_issues:['Missing file']}).label,'Completed · issues');
assert.equal(model.resultStatus({...a,state:'accepted',prior_state:null}).label,'Accepted');
assert.equal(vm.runInContext('resultSections(task.result.summary).checks',c),'All 165 tests pass');
assert.equal(vm.runInContext('resultPreviewLink(task).url',c),'http://localhost:4178/view');
c.introTask={result:{summary:'Implemented locally:\n\n- Added a swept-sine workflow.\n- Preserved the monitoring tools.'}};
assert.equal(vm.runInContext('resultOutcome(introTask)',c),'Added a swept-sine workflow.');
const before=JSON.stringify(a),rows=vm.runInContext('renderResults()',c);
assert.ok(rows.includes('1 latest result'));assert.ok(rows.includes('Open preview'));assert.ok(rows.includes('Files (1)'));
assert.ok(rows.includes('data-result-tone="finished">Completed'));assert.ok(!rows.includes('No checks reported'));
assert.ok(rows.includes('view.jpg'));assert.ok(rows.includes('Technical details'));assert.equal(JSON.stringify(a),before);
const signature=vm.runInContext('resultsSignature()',c);b.latest_update='More progress';b.updated='2026-10-14T01:02:00Z';
assert.equal(vm.runInContext('resultsSignature()',c),signature);
a.handoff_issues=['Could not capture missing.svg'];assert.notEqual(vm.runInContext('resultsSignature()',c),signature);
assert.ok(vm.runInContext('agentResultRows([task])',c).includes('Could not capture missing.svg'));
c.firstDisclosure={dataset:{panelDetail:'more'},closest:()=>({dataset:{savedResult:'first'}})};
c.nextDisclosure={dataset:{panelDetail:'more'},closest:()=>({dataset:{savedResult:'next'}})};
assert.notEqual(vm.runInContext('detailKey(firstDisclosure)',c),vm.runInContext('detailKey(nextDisclosure)',c));
for(const summary of ['[Preview](javascript:alert)', '![Preview](https://example.com/image)', '`[Preview](https://example.com/app)`', '[Preview](https://user:password@example.com/app)', '[Documentation](https://example.com/docs)']){
 c.task={result:{summary}};assert.equal(vm.runInContext('resultPreviewLink(task)',c),null);
}
c.summary='Changes: Viewer saved.\nChecks: Unit tests fail; browser checks not run.\nLimits: Measurement comparison pending.';
assert.ok(vm.runInContext('resultSections(summary).checks',c).includes('fail'));
c.summary='Viewer saved.\n\nNo tests were run.\n\nPrint checks not run.';
assert.ok(vm.runInContext('resultSections(summary).limits',c).includes('not run'));
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(root/'static/agent-model.js'),
                                 str(root/'static/task-feedback.js'), str(root/'static/agents.js')],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('node'), 'Node is needed for presentation checks')
    def test_run_ownership_full_history_and_discussion_result_are_preserved(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const model=require(process.argv[1]);
const first={id:'first',agent_id:'a',state:'superseded',created:'2026-10-13T10:00:00Z',finished_at:'2026-10-13T11:00:00Z'};
const next={id:'next',agent_id:'a',parent_task_id:'first',created:'2026-10-13T11:00:02Z',state:'running',continuation_note:'Continue with the smaller layout'};
const messages=[{id:'old',task_id:'first',role:'agent',at:first.created,text:'Earlier message',capture_name:'old.json'},
 {id:'follow',role:'user',at:'2026-10-13T11:00:01Z',text:'Continue with the smaller layout',status:'delivered'},
 ...Array.from({length:9},(_,i)=>({id:'current-'+i,task_id:'next',role:'agent',at:next.created,text:'Message '+i}))];
next.conversation=messages;
const before=JSON.stringify([first,next]),groups=model.conversationRuns([next,first],next);
assert.deepEqual(groups.map(x=>[x.task.id,x.messages.length]),[['first',1],['next',10]]);
assert.equal(JSON.stringify([first,next]),before);
const c={AgentModel:model,document:{addEventListener(){}},setInterval(){},planModal(){},state:{tasks:[first,next]},
 esc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),date:x=>x,stateName:x=>x};
vm.createContext(c);for(const path of process.argv.slice(2))vm.runInContext(fs.readFileSync(path,'utf8'),c);
c.task=next;const html=vm.runInContext('agentConversationHTML(task)',c);
assert.equal((html.match(/class="message /g)||[]).length,11);
assert.ok(html.includes('Earlier runs · 1'));assert.ok(!html.includes('<details class="earlier-runs" open'));
assert.ok(html.includes('/api/agent-capture/first/old.json'));assert.ok(html.includes('Message 8'));
assert.equal(vm.runInContext("agentReplyHelp({state:'queued',interactive:true})",c),'Queued until this agent starts');
assert.equal(vm.runInContext("agentReplyHelp({state:'running',interactive:true})",c),'Sent to the live session');
const legacy='No project files could be captured for this editable assignment. Supply the deliverables or correct their paths before review.';
c.task={state:'ready_for_review',config:{mode:'codex'},expected_outputs:[],output_links:[],handoff_issues:[legacy],result:{status:'completed',summary:'A discussion reply.',artifacts:[],handoff_issues:[legacy]}};
const original=JSON.stringify(c.task),reply=vm.runInContext('resultHandoffHTML(task)',c);
assert.ok(reply.includes('Discussion reply · no files expected'));assert.ok(reply.includes('>Reply</span>'));
assert.ok(!reply.includes(legacy));assert.equal(JSON.stringify(c.task),original);
assert.equal(model.resultView(c.task).delivery_status,'complete');
c.task.result.artifacts=['missing.svg'];c.task.handoff_issues=['Could not capture missing.svg'];
assert.ok(vm.runInContext('resultHandoffHTML(task)',c).includes('Could not capture missing.svg'));
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(root/'static/agent-model.js'),
                                 str(root/'static/task-feedback.js'), str(root/'static/agents.js')],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
