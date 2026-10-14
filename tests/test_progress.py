"""Progress presentation never promotes a tool event or agent claim to success."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import unittest

from cos.progress import activity_snapshot, apply_progress, message_details
import test_app
from test_app import fixture_events


class ProgressTests(unittest.TestCase):
    def test_structured_update_extracts_summary_and_reported_blocker(self):
        raw=json.dumps({'status':'blocked','summary':'The source PDF is unavailable.','artifacts':[]})
        self.assertEqual(message_details(raw), {'text':'The source PDF is unavailable.','reported_status':'blocked'})
        self.assertIsNone(message_details('{"summary":"unfinished'))
        self.assertIsNone(message_details('command_execution: completed'))
        self.assertIsNone(message_details('{"other":"data"}'))

    def test_tool_events_preserve_human_update_and_still_refresh_activity(self):
        task={'state':'running','progress':'Starting','history':[]}
        apply_progress(task,{'event':'process.started','progress_kind':'activity','progress':'CLI started'},'2026-10-13T03:00:00+00:00')
        apply_progress(task,{'progress':'Inspecting the existing viewer.','progress_kind':'message'},'2026-10-13T03:00:10+00:00')
        for i in range(105):
            apply_progress(task,{'progress':'command_execution: completed','progress_kind':'activity'},'2026-10-13T03:00:20+00:00')
        self.assertEqual(task['progress'],'Inspecting the existing viewer.')
        self.assertEqual(task['latest_update_at'],'2026-10-13T03:00:10+00:00')
        self.assertEqual(task['last_activity_at'],'2026-10-13T03:00:20+00:00')
        self.assertEqual(len(task['history']),100)
        self.assertEqual(activity_snapshot(task)['latest_update'],'Inspecting the existing viewer.')

    def test_reported_blocker_does_not_change_execution_state(self):
        task={'state':'running','history':[]}
        apply_progress(task,{'progress':'A source is unavailable.','progress_kind':'message','reported_status':'blocked'},'2026-10-13T03:00:10+00:00')
        apply_progress(task,{'progress':'command_execution: completed','progress_kind':'activity'},'2026-10-13T03:00:20+00:00')
        self.assertEqual(task['state'],'running')
        self.assertEqual(task['reported_status'],'blocked')
        self.assertEqual(task['progress'],'A source is unavailable.')

    def test_legacy_history_is_presented_without_mutating_saved_record(self):
        task={'state':'running','progress':'command_execution: completed','history':[
            {'at':'2026-10-13T03:00:00+00:00','event':'process.started','text':'CLI started'},
            {'at':'2026-10-13T03:00:10+00:00','event':'item.completed','text':json.dumps({'summary':'Reviewing reference curves.','status':'in_progress'})},
            {'at':'2026-10-13T03:00:20+00:00','event':'item.completed','text':'command_execution: completed'}]}
        before=copy.deepcopy(task);shown=activity_snapshot(task)
        self.assertEqual(shown['latest_update'],'Reviewing reference curves.')
        self.assertEqual(shown['started_at'],'2026-10-13T03:00:00+00:00')
        self.assertEqual(task,before)


class AdapterProgressTests(unittest.TestCase):
    setUp = test_app.AdapterTests.setUp
    execute = test_app.AdapterTests.execute
    # Reuse only the mock adapter fixture, not the inherited adapter test suite.
    def test_agent_updates_are_separate_from_tool_activity(self):
        events=fixture_events()
        long=json.dumps({'status':'blocked','summary':'Source unavailable. '+('x'*2100)})
        events[2:2]=[
            {'type':'item.completed','item':{'type':'agent_message','text':long}},
            {'type':'item.completed','item':{'type':'command_execution','status':'completed'}}]
        result,updates,_=self.execute(events)
        messages=[x for x in updates if x.get('progress_kind')=='message']
        self.assertEqual(messages[0]['reported_status'],'blocked')
        self.assertTrue(messages[0]['progress'].startswith('Source unavailable.'))
        self.assertEqual(result['status'],'completed')
        self.assertTrue(any(x.get('progress_kind')=='activity' and x['progress']=='command_execution: completed' for x in updates))


class BrowserFeedbackLogicTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node is needed for browser formatter checks')
    def test_legacy_updates_elapsed_time_reported_checks_and_escaping(self):
        source=Path(__file__).resolve().parents[1]/'static/task-feedback.js'
        script=r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={document:{addEventListener:()=>{}},setInterval:()=>{},planModal:()=>{},stateName:x=>x.replaceAll('_',' '),
  esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
vm.createContext(context);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),context);
context.t={id:'qa',state:'running',updated:'2026-10-13T03:02:00Z',progress:'command_execution: completed',
 history:[{at:'2026-10-13T03:00:00Z',event:'process.started',text:'Starting'},
 {at:'2026-10-13T03:01:00Z',event:'item.completed',text:JSON.stringify({status:'blocked',summary:'<script>Source unavailable</script>'})},
 {at:'2026-10-13T03:02:00Z',event:'item.completed',text:'command_execution: completed'}]};
let feedback=vm.runInContext('taskFeedback(t)',context);
assert.equal(feedback.reported,'blocked');assert.equal(feedback.text,'<script>Source unavailable</script>');
let html=vm.runInContext('taskFeedbackHTML(t)',context);
assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('still running'));assert.ok(!html.includes('command_execution'));
assert.ok(!html.includes('Agent reports a blocker'));assert.ok(!html.includes('agent-feedback warning'));
assert.equal(vm.runInContext("elapsedLabel('2026-10-13T03:00:00Z','2026-10-13T03:02:05Z',0)",context),'2m 5s');
context.t.state='blocked';context.t.finished_at='2026-10-13T03:03:00Z';
context.t.config={mode:'codex'};context.t.output_links=[];
context.t.result={summary:'Changes: Added a viewer.\nChecks: Unit tests passed; browser checks not run.\nLimits: No measured correlation.',decisions:[],next_steps:['Review the curve comparison.']};
html=vm.runInContext('resultHandoffHTML(t)',context);
assert.ok(html.includes('INCOMPLETE'));assert.ok(html.includes('Unit tests passed; browser checks not run.'));
assert.ok(html.includes('Agent-reported checks'));assert.ok(!html.includes('Files (0)'));
assert.ok(!html.includes('Accept result'));assert.ok(html.includes('Review the curve comparison.'));
context.t.state='failed';context.t.latest_update='Core saved; <browser checks> pending.';
context.t.result={summary:'Event stream limit exceeded'};
html=vm.runInContext('resultHandoffHTML(t)',context);
assert.ok(html.includes('Last agent update before the stop'));assert.ok(html.includes('verification was interrupted'));
assert.ok(html.includes('&lt;browser checks&gt;'));assert.ok(html.includes('Event stream limit exceeded'));
assert.ok(!html.includes('Accept result'));

context.oldText='Partial handoff saved. Baseline tests passed 146/146.\n\nPDF access was denied.';
const old=vm.runInContext('resultSections(oldText)',context);
assert.ok(old.checks.includes('Baseline tests passed 146/146'));assert.ok(old.limits.includes('denied'));
'''
        result=subprocess.run([shutil.which('node'),'-e',script,str(source)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
