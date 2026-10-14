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
assert.ok(reply.includes('Discussion reply · no files expected'));assert.ok(reply.includes('<h3>Reply</h3>'));
assert.ok(!reply.includes(legacy));assert.equal(JSON.stringify(c.task),original);
assert.equal(model.resultView(c.task).delivery_status,'complete');
c.task.result.artifacts=['missing.svg'];c.task.handoff_issues=['Could not capture missing.svg'];
assert.ok(vm.runInContext('resultHandoffHTML(task)',c).includes('Could not capture missing.svg'));
'''
        result = subprocess.run([shutil.which('node'), '-e', script, str(root/'static/agent-model.js'),
                                 str(root/'static/task-feedback.js'), str(root/'static/agents.js')],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
