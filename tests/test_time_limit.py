"""An approved assignment can run without a deadline while retaining stop controls."""
import copy
from pathlib import Path
import shutil
import subprocess
import threading
import unittest
from unittest.mock import patch

import test_app
import test_research
from cos.safety import Invalid
from cos.service import normalized_spec


class TimeLimitAdapterTests(unittest.TestCase):
    setUp = test_app.AdapterTests.setUp
    execute = test_app.AdapterTests.execute

    def test_no_time_limit_survives_elapsed_time_and_keeps_session_checks(self):
        self.config['timeout_seconds']=0
        with patch('cos.adapter.time.monotonic',side_effect=[0]+[1000000]*100) as clock:
            result,_,_=self.execute(session=test_app.SID)
        self.assertEqual(result['status'],'completed')
        self.assertEqual(result['session_id'],test_app.SID)
        self.assertEqual(clock.call_count,1)
        result,_,_=self.execute(test_app.fixture_events(sid=test_app.SID2),session=test_app.SID)
        self.assertEqual(result['status'],'failed')

    def test_no_time_limit_still_cancels_and_cleans_up(self):
        self.config['timeout_seconds']=0
        cancel=threading.Event();cancel.set()
        self.assertEqual(self.execute(cancel=cancel)[0]['status'],'cancelled')

    def test_bounded_deadline_is_still_enforced_with_clear_recovery_message(self):
        with patch('cos.adapter.time.monotonic',side_effect=[0,901]):
            result,_,_=self.execute()
        self.assertEqual(result['status'],'blocked')
        self.assertIn('900 seconds',result['summary'])
        self.assertIn('Partial edits remain on disk',result['summary'])


class TimeLimitServiceTests(unittest.TestCase):
    setUp = test_research.ResearchServiceTests.setUp
    tearDown = test_research.ResearchServiceTests.tearDown
    draft = test_research.ResearchServiceTests.draft
    drain = test_app.ServiceTests.drain

    def unlimited(self):
        plan=self.draft();specs=copy.deepcopy(plan['specs']);specs[0]['time_limit']='none'
        return self.s.edit_plan(plan['id'],plan['revision'],specs)

    def test_defaults_and_invalid_time_choices(self):
        raw=self.draft()['specs'][0];self.assertEqual(raw['time_limit'],'none')
        for value in (None,False,0,'unlimited',[],{}):
            with self.subTest(value=value),self.assertRaises(Invalid):normalized_spec(dict(raw,time_limit=value))
        self.assertEqual(normalized_spec(dict(raw,time_limit='none'))['time_limit'],'none')

    def test_unlimited_is_approved_and_applies_only_to_that_worker(self):
        plan=self.unlimited();approved=self.s.approve(plan['id'],plan['revision'])
        self.assertEqual(approved['approval']['payload']['specs'][0]['time_limit'],'none')
        self.assertFalse(self.adapter.calls)
        launched=self.s.launch(plan['id']);self.drain()
        task=self.s.store.get('task',launched['task_ids'][0])
        self.assertEqual(task['config']['timeout_seconds'],0)
        self.assertEqual(self.adapter.calls[-1]['timeout_seconds'],0)
        self.assertEqual(self.s.config()['timeout_seconds'],900)
        self.s.settings({'default_time_limit':'default'});next_plan=self.draft();self.s.approve(next_plan['id'],next_plan['revision']);self.s.launch(next_plan['id']);self.drain()
        self.assertEqual(self.adapter.calls[-1]['timeout_seconds'],900)

    def test_time_limit_edit_invalidates_approval_and_tampering_is_rejected(self):
        plan=self.draft();approved=self.s.approve(plan['id'],plan['revision'])
        specs=copy.deepcopy(plan['specs']);specs[0]['time_limit']='none'
        revised=self.s.edit_plan(plan['id'],plan['revision'],specs)
        self.assertEqual(revised['state'],'draft')
        with self.assertRaises(Invalid):self.s.launch(revised['id'])
        self.s.approve(revised['id'],revised['revision'])
        revised=self.s.store.get('plan',revised['id']);revised['specs'][0]['time_limit']='default'
        self.s.store.put('plan',revised)
        with self.assertRaises(Invalid):self.s.launch(revised['id'])
        self.assertEqual(self.s.store.all('task'),[])

    def test_resume_retains_unlimited_choice_and_requires_new_approval(self):
        plan=self.unlimited();self.s.approve(plan['id'],plan['revision']);launched=self.s.launch(plan['id']);self.drain()
        task=self.s.store.get('task',launched['task_ids'][0])
        revised=self.s.action(task['id'],'revise','Complete the remaining verification.')
        self.assertEqual(revised['specs'][0]['time_limit'],'none')
        self.assertEqual(revised['specs'][0]['resume_session'],task['session_id'])
        with self.assertRaises(Invalid):self.s.launch(revised['id'])
        self.s.approve(revised['id'],revised['revision']);self.s.launch(revised['id']);self.drain()
        self.assertEqual(self.adapter.calls[-1]['session'],task['session_id'])
        self.assertEqual(self.adapter.calls[-1]['timeout_seconds'],0)


class TimeLimitPresentationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'Node is needed for the UI check')
    def test_none_is_visible_selected_and_locked_after_launch(self):
        source=Path(__file__).resolve().parents[1]/'static/task-feedback.js'
        script=r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={document:{addEventListener:()=>{}},setInterval:()=>{},planModal:()=>{},esc:x=>String(x)};
vm.createContext(context);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),context);
let html=vm.runInContext('timeLimitHTML({},900)',context);
assert.ok(html.includes('value="default" selected'));assert.ok(html.includes('900 seconds'));
html=vm.runInContext("timeLimitHTML({time_limit:'none'},900,true)",context);
assert.ok(html.includes('value="none" selected'));assert.ok(html.includes('disabled'));
assert.ok(html.includes('pause or cancel'));
'''
        result=subprocess.run([shutil.which('node'),'-e',script,str(source)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
