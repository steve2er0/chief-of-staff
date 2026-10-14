"""Owner delegation, open capacity, and useful results without validation gates."""
import copy
import unittest

import test_app
from cos.safety import Invalid


class AutonomousWorkflowTests(unittest.TestCase):
    def setUp(self):
        test_app.ServiceTests.setUp(self)
        self.adapter=test_app.FakeAdapter();self.s.adapter=self.adapter
        self.work=self.root/'project';self.work.mkdir()
        self.p=self.s.project({'cwd':str(self.work)},self.p['id'])
        self.s.settings({'mode':'codex'})

    tearDown=test_app.ServiceTests.tearDown
    drain=test_app.ServiceTests.drain

    def draft(self,project=None,**extra):
        spec=dict(title='Deliver the goal',purpose='Complete useful work and own its checks',criteria=['Useful local result'],access='workspace-write',expected_outputs=[])
        spec.update(extra)
        return self.s._draft((project or self.p)['id'],'Goal','Owner-selected fixture',[spec],'Synthetic fixture')

    def test_capacity_has_no_ceiling_and_zero_is_unlimited(self):
        self.assertEqual(self.s.settings({'concurrency':37})['concurrency'],37)
        self.assertEqual(self.s.settings({'concurrency':0})['concurrency'],0)
        for invalid in (-1,True,1.5):
            with self.assertRaises(Invalid):self.s.settings({'concurrency':invalid})

    def test_capacity_can_change_while_agents_work(self):
        self.s.settings({'concurrency':2});self.adapter.hold=True
        for i in range(9):
            work=self.root/('independent-'+str(i));work.mkdir()
            p=self.s.project({'name':'Independent '+str(i),'goal':'Read this project','cwd':str(work)})
            self.s.cancel_project_review(p['id'])
            plan=self.draft(p,access='read-only')
            self.s.delegate_now(plan['id'],plan['revision'])
        self.s.tick();self.assertEqual(len(self.s.active),2)
        self.s.settings({'concurrency':0});self.s.tick()
        self.assertEqual(len(self.s.active),9)
        self.assertFalse(self.s.slots_full())
        self.adapter.release.set();self.drain()

    def test_new_tasks_use_preferences_and_continuations_keep_approved_policy(self):
        self.s.settings({'default_execution_policy':'yolo','default_time_limit':'none'})
        whole=self.s.prepare_project_assignment(self.p['id'])
        self.assertEqual(whole['specs'][0]['access'],'workspace-write')
        self.assertEqual(whole['specs'][0]['execution_policy'],'yolo')
        plan=self.draft();self.assertEqual(plan['specs'][0]['execution_policy'],'yolo')
        self.assertEqual(plan['specs'][0]['time_limit'],'none')
        self.adapter.writer=lambda p:(p/'chosen.txt').write_text('Agent-chosen deliverable')
        self.adapter.result=dict(test_app.GOOD,artifacts=['chosen.txt'])
        plan=self.s.delegate_now(plan['id'],plan['revision']);self.drain()
        task=self.s.store.get('task',plan['task_ids'][0])
        self.assertEqual(task['config']['timeout_seconds'],0)
        self.assertEqual(task['state'],'ready_for_review');self.assertEqual(task['delivery_notes'],[])
        self.s.settings({'default_execution_policy':'sandboxed','default_time_limit':'default'})
        retry=self.s.action(task['id'],'revise','Make a small improvement')
        self.assertEqual(retry['specs'][0]['execution_policy'],'yolo')
        self.assertEqual(retry['specs'][0]['time_limit'],'none')
        reader=self.draft(access='read-only')
        self.assertEqual(reader['specs'][0]['execution_policy'],'sandboxed')

    def test_delegate_now_is_idempotent_and_captures_current_context_without_reapproval(self):
        plan=self.draft(access='read-only')
        self.s.project({'goal':'Changed owner direction'},self.p['id'])
        launched=self.s.delegate_now(plan['id'],plan['revision'])
        self.assertEqual(launched['context']['vision'],'Changed owner direction')
        self.assertEqual(launched['task_ids'],self.s.delegate_now(plan['id'],plan['revision'])['task_ids'])
        self.assertEqual(len(self.s.store.all('task')),1);self.drain()

    def test_optional_check_limits_return_for_review_without_owner_homework(self):
        self.adapter.result=dict(test_app.GOOD,status='blocked',execution_verified=True,
            summary='Changes: Useful result saved.\nChecks: Core tests passed.\nLimits: Optional print check unavailable.',artifacts=['result.txt'])
        self.adapter.writer=lambda p:(p/'result.txt').write_text('Useful delivered work')
        plan=self.draft();plan=self.s.delegate_now(plan['id'],plan['revision']);self.drain()
        task=self.s.store.get('task',plan['task_ids'][0])
        self.assertEqual(task['state'],'ready_for_review');self.assertEqual(task['delivery_status'],'partial')
        self.assertEqual(task['result']['status'],'blocked')
        self.assertEqual(self.s.snapshot()['attention'][0]['group'],'reviews')
        self.assertEqual(self.s.store.get('project',self.p['id'])['accepted_results'],[])
        self.s.handoff_checks(task['id'],[dict(id='optional',label='Optional check',status='pending',details='Unavailable check',source='Agent report')])
        self.assertEqual(self.s.store.get('task',task['id'])['state'],'ready_for_review')
        self.s.action(task['id'],'accept','Useful work meets my current goal')

    def test_meaningful_decision_still_has_an_attention_handoff(self):
        self.adapter.result=dict(test_app.GOOD,status='blocked',execution_verified=True,decisions=['Choose which installed hardware to target.'])
        plan=self.draft(access='read-only');plan=self.s.delegate_now(plan['id'],plan['revision']);self.drain()
        self.assertEqual(self.s.store.get('task',plan['task_ids'][0])['state'],'blocked')

    def test_plan_can_include_more_than_twenty_owner_selected_agents(self):
        spec=dict(title='Read',purpose='Read local files',criteria=['Return a report'],access='read-only',expected_outputs=[])
        plan=self.s._draft(self.p['id'],'Selected agents','Owner',[copy.deepcopy(spec) for _ in range(25)],'Fixture')
        self.assertEqual(len(plan['specs']),25)
