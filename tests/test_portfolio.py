"""Project workflow tests. All model calls use the injected synthetic adapter."""
import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import time
import unittest

from cos.portfolio import validate_proposal, validate_graph
from cos.safety import Invalid
from cos.service import Service
from cos.store import Store, uid
from test_app import FakeAdapter, GOOD


class PortfolioTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.s = Service(self.root / 'data', start=False, demo_delay=.01)
        self.p = self.s.project({'vision': 'Develop a synthetic vibration data viewer', 'priority': 'advance'})

    def tearDown(self):
        self.s.close()
        self.tmp.cleanup()

    def work_map(self, pid=None):
        proposal = self.s.breakdown(pid or self.p['id'])
        self.s.adopt_proposal(proposal['id'], 'adopt')
        return [x for x in self.s.store.all('work_item') if x['project_id'] == (pid or self.p['id'])]

    def drain(self):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            self.s.tick()
            if not self.s.active and not any(t['state']=='queued' for t in self.s.store.all('task')):
                return
            time.sleep(.01)
        self.fail('Worker did not finish')

    def delegated_result(self):
        items = self.work_map()
        item = next(x for x in items if x['kind']=='investigation')
        plan = self.s.prepare_delegation(self.p['id'], [item['id']])
        self.s.approve(plan['id'], plan['revision'])
        plan = self.s.launch(plan['id'])
        self.drain()
        return item, self.s.store.get('task', plan['task_ids'][0])

    def test_vision_intake_creates_project_without_execution(self):
        self.assertEqual(self.p['vision'], 'Develop a synthetic vibration data viewer')
        self.assertTrue(self.p['name'])
        self.assertEqual(len(self.s.store.all('message')), 2)
        self.assertEqual(len(self.s.store.all('proposal')), 1)
        self.assertEqual(self.s.store.all('task'), [])
        self.assertEqual(self.s.store.all('work_item'), [])
        self.assertEqual(self.p['brief'], {})

    def test_early_conversation_leaves_planning_optional(self):
        original = copy.deepcopy(self.p)
        first = self.s.store.all('proposal')[0]
        self.assertEqual(first['data']['questions'], [])
        for key in ('milestone', 'success', 'constraints'):
            self.assertEqual(first['data'][key], '')
        self.s.discuss(self.p['id'], 'I am still exploring the idea.')
        p = self.s.store.get('project', self.p['id'])
        for key in ('vision', 'vision_history', 'brief', 'records'):
            self.assertEqual(p[key], original[key])
        self.assertFalse(self.s.store.all('work_item'))
        self.assertFalse(self.s.store.all('plan'))
        self.assertFalse(self.s.store.all('task'))

    def test_model_conversation_can_reply_without_a_planning_checklist(self):
        original = copy.deepcopy(self.p)
        self.s.adapter = FakeAdapter({'status':'completed', 'summary':'A plot would make this result easier to compare. I suggest reviewing the existing plotting flow.',
            'interpretation':'An idea for exploring vibration data.', 'milestone':'', 'success':'',
            'constraints':'', 'next_step':'Review the existing plotting flow.', 'questions':[]})
        self.s.settings({'mode':'codex'})
        job = self.s.discuss(self.p['id'], 'Let me explain the vision first.', 'codex')
        self.drain()
        self.assertEqual(self.s.store.get('job',job['id'])['state'], 'completed')
        proposal = self.s.store.all('proposal')[-1]
        message = self.s.store.all('message')[-1]
        self.assertIn('reviewing the existing plotting flow', message['text'])
        self.assertEqual(proposal['data']['questions'], [])
        self.assertEqual(proposal['state'], 'suggested')
        context = json.loads(self.s.adapter.calls[0]['prompt'].split('\n')[-1])['project']
        self.assertEqual(context['interaction_stage'], 'conversation')
        self.assertEqual(self.s.adapter.calls[0]['sandbox'], 'read-only')
        p = self.s.store.get('project', self.p['id'])
        for key in ('vision', 'vision_history', 'brief', 'records'):
            self.assertEqual(p[key], original[key])
        self.assertFalse(self.s.store.all('work_item'))
        self.assertFalse(self.s.store.all('plan'))
        self.assertFalse(self.s.store.all('task'))

    def test_framing_edits_are_adopted_without_rewriting_vision(self):
        proposal = self.s.store.all('proposal')[0]
        data = copy.deepcopy(proposal['data'])
        data.update(interpretation='A scoped viewer prototype', milestone='Import a known sample', questions=[])
        self.s.adopt_proposal(proposal['id'], 'adopt', data)
        p = self.s.store.get('project', self.p['id'])
        self.assertEqual(p['vision'], self.p['vision'])
        self.assertEqual(p['brief']['milestone'], 'Import a known sample')
        self.assertEqual(p['brief']['interpretation'], 'A scoped viewer prototype')
        self.assertFalse(self.s.store.all('task'))

    def test_adopted_questions_reach_decision_batch_with_provenance(self):
        proposal = self.s.store.all('proposal')[0]
        data = copy.deepcopy(proposal['data'])
        data['questions'] = ['Which of the two conflicting milestones takes priority?']
        self.s.adopt_proposal(proposal['id'], 'adopt', data)
        p = self.s.store.get('project', self.p['id'])
        self.assertEqual(p['records'][0]['status'], 'open')
        self.assertIn(proposal['id'], p['records'][0]['provenance'])
        self.assertEqual(self.s.portfolio_briefing()['landscape'][0]['questions'], 1)

    def test_local_followup_builds_on_note_without_creating_questions(self):
        result = self.s.discuss(self.p['id'], 'I want to plot it')
        self.assertIn('I want to plot it', result['data']['summary'])
        self.assertTrue(result['data']['next_step'])
        self.assertEqual(result['data']['questions'], [])
        self.s.adopt_proposal(result['id'], 'adopt')
        p = self.s.store.get('project', self.p['id'])
        self.assertFalse([r for r in p['records'] if r['category']=='question'])
        self.assertEqual(self.s.portfolio_briefing()['landscape'][0]['questions'], 0)
        self.assertFalse(self.s.store.all('work_item'))
        self.assertFalse(self.s.store.all('plan'))
        self.assertFalse(self.s.store.all('task'))

    def test_model_decision_question_remains_supported_and_unapproved(self):
        original = copy.deepcopy(self.p)
        question = 'Should the existing output format remain compatible, or may this version replace it?'
        self.s.adapter = FakeAdapter({'status':'completed',
            'summary':'Those choices lead to different implementation scopes. '+question,
            'interpretation':'An update with an unresolved compatibility decision.',
            'milestone':'', 'success':'', 'constraints':'',
            'next_step':'Choose the compatibility requirement before scoping implementation.', 'questions':[question]})
        self.s.settings({'mode':'codex'})
        job = self.s.discuss(self.p['id'], 'We need to choose between retaining and replacing the format.', 'codex')
        self.drain()
        self.assertEqual(self.s.store.get('job',job['id'])['state'], 'completed')
        proposal = self.s.store.all('proposal')[-1]
        self.assertEqual(proposal['data']['questions'], [question])
        self.assertEqual(proposal['state'], 'suggested')
        p = self.s.store.get('project',self.p['id'])
        for key in ('vision','vision_history','brief','records'):
            self.assertEqual(p[key], original[key])
        self.assertFalse(self.s.store.all('work_item'))
        self.assertFalse(self.s.store.all('plan'))
        self.assertFalse(self.s.store.all('task'))

    def test_stale_proposal_refused(self):
        proposal = self.s.store.all('proposal')[0]
        self.s.project({'vision':'Updated owner vision'}, self.p['id'])
        with self.assertRaises(Invalid): self.s.adopt_proposal(proposal['id'], 'adopt')
        self.assertEqual(self.s.store.get('project', self.p['id'])['brief'], {})

    def test_vision_history_and_docx_source_are_retained(self):
        self.s.project({'vision':'New direction','source':'DOCX / SHA256 example'}, self.p['id'])
        p = self.s.store.get('project', self.p['id'])
        self.assertEqual([v['text'] for v in p['vision_history']], [self.p['vision'], 'New direction'])
        self.assertEqual(p['sources'][0]['source'], 'DOCX / SHA256 example')

    def test_discussion_is_durable_and_does_not_agree_to_decisions(self):
        self.s.discuss(self.p['id'], 'The first milestone might be import support.')
        self.assertIn('import support', self.s.store.all('message')[-2]['text'])
        self.assertEqual(self.s.store.get('project', self.p['id'])['brief'], {})
        self.assertEqual(self.s.store.all('task'), [])
        self.assertIn('import support', self.s.portfolio_briefing()['landscape'][0]['last_left'])

    def test_breakdown_requires_adoption_and_is_idempotent(self):
        proposal = self.s.breakdown(self.p['id'])
        self.assertEqual(self.s.store.all('work_item'), [])
        self.s.adopt_proposal(proposal['id'], 'adopt')
        self.s.adopt_proposal(proposal['id'], 'adopt')
        self.assertEqual(len(self.s.store.all('work_item')), 6)
        self.assertFalse(self.s.store.all('task'))

    def test_edited_breakdown_keeps_graph_and_removes_pieces(self):
        proposal = self.s.breakdown(self.p['id'])
        data = copy.deepcopy(proposal['data'])
        data['items'] = data['items'][:2]
        data['items'][1]['title'] = 'Research actual user formats'
        self.s.adopt_proposal(proposal['id'], 'adopt', data)
        self.assertEqual(len(self.s.store.all('work_item')), 2)
        self.assertEqual(self.s.store.all('work_item')[1]['title'], 'Research actual user formats')

    def test_cycle_and_foreign_dependencies_refused_atomically(self):
        items = self.work_map()
        milestone, research = items[:2]
        self.s.work_item(self.p['id'], dict(milestone, depends_on=[research['id']]), milestone['id'])
        with self.assertRaises(Invalid): self.s.work_item(self.p['id'], dict(research, depends_on=[milestone['id']]), research['id'])
        self.assertEqual(self.s.store.get('work_item', research['id'])['depends_on'], [])
        with self.assertRaises(Invalid): self.s.work_item(self.p['id'], dict(research, depends_on=[uid()]), research['id'])

    def test_model_map_contract_rejects_duplicates_and_cycles(self):
        data = self.s.breakdown(self.p['id'])['data']
        raw = dict(data, status='completed')
        raw['items'][0]['depends_on'] = ['prototype']
        with self.assertRaises(Invalid): validate_proposal('workmap', raw)

    def test_selective_delegation_creates_only_draft(self):
        items = self.work_map()
        selected = next(x for x in items if x['kind']=='investigation')
        plan = self.s.prepare_delegation(self.p['id'], [selected['id']])
        self.assertEqual(plan['state'], 'draft')
        self.assertEqual(len(plan['specs']), 1)
        self.assertEqual(plan['specs'][0]['work_item_id'], selected['id'])
        self.assertEqual(self.s.store.all('task'), [])
        self.assertEqual(self.s.prepare_delegation(self.p['id'], [selected['id']])['id'], plan['id'])
        self.s.approve(plan['id'], plan['revision'])
        self.assertEqual(self.s.store.all('task'), [])
        self.s.launch(plan['id'])
        self.assertEqual(len(self.s.store.all('task')), 1)

    def test_dependencies_and_deferred_pieces_cannot_delegate(self):
        items = self.work_map()
        for kind in ('implementation', 'future'):
            item = next(x for x in items if x['kind']==kind)
            with self.assertRaises(Invalid): self.s.prepare_delegation(self.p['id'], [item['id']])
        self.assertFalse(self.s.store.all('plan'))

    def test_foreign_project_cannot_be_delegated(self):
        items = self.work_map()
        other = self.s.project({'vision':'Another project'})
        with self.assertRaises(Invalid): self.s.prepare_delegation(other['id'], [items[0]['id']])

    def test_editing_selection_preserves_correct_internal_links(self):
        items = self.work_map()[:2]
        plan = self.s.prepare_delegation(self.p['id'], [x['id'] for x in items])
        edited = self.s.edit_plan(plan['id'], plan['revision'], [plan['specs'][1]])
        self.assertEqual(edited['specs'][0]['work_item_id'], items[1]['id'])
        forged = dict(edited['specs'][0], work_item_id=items[0]['id'], resume_session=uid())
        edited = self.s.edit_plan(plan['id'], edited['revision'], [forged])
        self.assertEqual(edited['specs'][0]['work_item_id'], items[1]['id'])
        self.assertNotIn('resume_session', edited['specs'][0])

    def test_work_map_change_invalidates_prepared_approval(self):
        item = self.work_map()[1]
        plan = self.s.prepare_delegation(self.p['id'], [item['id']])
        self.s.approve(plan['id'], plan['revision'])
        self.s.work_item(self.p['id'], dict(item, status='deferred'), item['id'])
        with self.assertRaises(Invalid): self.s.launch(plan['id'])

    def test_manual_completion_requires_evidence_and_unlocks_dependencies(self):
        items = self.work_map()
        item = items[0]
        with self.assertRaises(Invalid): self.s.work_item(self.p['id'], dict(item, status='done'), item['id'])
        self.s.work_item(self.p['id'], dict(item, status='done', completion_note='Owner agreed a sample import milestone'), item['id'])
        interface = next(x for x in items if x['kind']=='discussion')
        self.assertEqual(len(self.s.prepare_delegation(self.p['id'], [interface['id']])['specs']), 1)

    def test_partial_findings_do_not_accept_or_complete_work(self):
        item, task = self.delegated_result()
        self.s.partial_result(task['id'], 'One useful finding; the remainder needs revision.')
        self.assertEqual(self.s.store.get('task', task['id'])['state'], 'ready_for_review')
        self.assertNotEqual(self.s.store.get('work_item', item['id'])['status'], 'done')
        self.assertFalse(self.s.store.get('project', self.p['id'])['accepted_results'])
        self.assertEqual(len(self.s.store.all('finding')), 1)

    def test_partial_findings_reject_tampered_snapshots(self):
        _, task = self.delegated_result()
        self.s.output(task['id'],'completion.json').write_text('tampered')
        with self.assertRaises(Invalid): self.s.partial_result(task['id'], 'A finding')
        self.assertFalse(self.s.store.all('finding'))

    def test_acceptance_does_not_implicitly_complete_piece(self):
        item, task = self.delegated_result()
        self.s.action(task['id'], 'accept', 'Sufficient for the next discussion')
        self.assertEqual(self.s.store.get('work_item', item['id'])['status'], 'open')
        self.assertEqual(self.s.store.get('task', task['id'])['review_note'], 'Sufficient for the next discussion')

    def test_explicit_acceptance_can_complete_piece(self):
        item, task = self.delegated_result()
        self.s.action(task['id'], 'accept', 'All criteria assessed', complete_item=True)
        self.assertEqual(self.s.store.get('work_item', item['id'])['status'], 'done')
        self.assertIn('All criteria assessed', self.s.store.get('project', self.p['id'])['checkpoint'])

    def test_revisions_keep_link_and_require_new_approval(self):
        item, task = self.delegated_result()
        plan = self.s.action(task['id'], 'revise', 'Address the missing evidence')
        self.assertEqual(plan['specs'][0]['work_item_id'], item['id'])
        self.assertEqual(plan['state'], 'draft')
        with self.assertRaises(Invalid): self.s.launch(plan['id'])

    def test_project_direction_can_change_during_work_without_mutating_snapshot(self):
        item = self.work_map()[1]
        plan = self.s.prepare_delegation(self.p['id'], [item['id']])
        self.s.approve(plan['id'], plan['revision']); plan=self.s.launch(plan['id'])
        self.s.project({'vision':'New owner direction'}, self.p['id'])
        task = self.s.store.get('task', plan['task_ids'][0])
        self.assertEqual(task['context']['vision'], self.p['vision'])
        self.assertNotEqual(task['context']['version'], self.s.store.get('project', self.p['id'])['version'])

    def test_briefing_priorities_time_focus_and_check_in(self):
        other = self.s.project({'vision':'Another project','priority':'deferred'})
        self.s.portfolio_preferences({'vision':'Improve engineering capability','minutes':15,'focus_project':self.p['id']})
        before = self.s.portfolio_briefing()
        self.assertEqual(len(before['recommendations']), 1)
        self.assertEqual(len(before['landscape']), 2)
        self.assertEqual(before['preferences']['minutes'], 15)
        self.assertTrue(before['changes'])
        self.s.portfolio_preferences({'mark_seen':True})
        self.assertFalse(self.s.portfolio_briefing()['changes'])
        self.assertFalse(self.s.store.all('task'))

    def test_deferred_projects_never_recommended_and_dormant_projects_surface(self):
        p = self.s.store.get('project',self.p['id'])
        p['updated'] = (datetime.now(timezone.utc)-timedelta(days=10)).isoformat()
        self.s.store.put('project',p)
        self.assertEqual(len(self.s.portfolio_briefing()['dormant']), 1)
        self.s.project({'priority':'deferred'},p['id'])
        self.assertFalse(self.s.portfolio_briefing()['recommendations'])

    def test_invalid_priority_dates_and_preferences_refused(self):
        for raw in ({'priority':'highest'},{'deadline':'tomorrow'}):
            with self.assertRaises((Invalid,ValueError)): self.s.project(raw,self.p['id'])
        for raw in ({'minutes':True},{'minutes':30},{'focus_project':uid()}):
            with self.assertRaises((Invalid,ValueError)): self.s.portfolio_preferences(raw)

    def test_persistence_of_conversation_work_and_project_continuity(self):
        self.work_map();self.s.discuss(self.p['id'],'Resume with the import sample next.')
        self.s.portfolio_preferences({'focus_project':self.p['id']})
        self.s.close();self.s=Service(self.root/'data',start=False)
        self.assertEqual(len(self.s.store.all('work_item')),6)
        self.assertIn('import sample',self.s.portfolio_briefing()['landscape'][0]['last_left'])
        self.assertEqual(self.s.preferences()['focus_project'],self.p['id'])

    def test_record_updates_preserve_project_and_work_map_order(self):
        items=self.work_map()
        before=[x['id'] for x in self.s.store.all('work_item')]
        self.s.work_item(self.p['id'],dict(items[0],owner='me'),items[0]['id'])
        self.assertEqual([x['id'] for x in self.s.store.all('work_item')],before)
        other=self.s.project({'vision':'Second project'})
        self.s.project({'priority':'maintain'},self.p['id'])
        self.assertEqual([x['id'] for x in self.s.store.all('project')],[self.p['id'],other['id']])

    def test_legacy_migration_preserves_approved_plan_payload(self):
        plan=self.s.plan(self.p['id'],'Review legacy notes','Test')
        self.s.approve(plan['id'],plan['revision'])
        saved=self.s.store.get('plan',plan['id'])
        p=self.s.store.get('project',self.p['id'])
        for key in ('vision','vision_history','brief','priority','deadline','checkpoint','checkpoint_at'):p.pop(key,None)
        self.s.store.put('project',p)
        self.s.close();self.s=Service(self.root/'data',start=False)
        self.assertEqual(self.s.store.get('plan',plan['id']),saved)
        self.assertEqual(self.s.store.get('project',self.p['id'])['vision'],self.p['goal'])

    def test_model_discussion_and_decomposition_are_read_only_proposals(self):
        frame=copy.deepcopy(self.s.store.all('proposal')[0]['data'])
        adapter=FakeAdapter(dict(frame,status='completed'))
        self.s.adapter=adapter;self.s.settings({'mode':'codex'})
        job=self.s.discuss(self.p['id'],'Help define the actual milestone','codex');self.drain()
        self.assertEqual(self.s.store.get('job',job['id'])['state'],'completed')
        self.assertEqual(adapter.calls[0]['sandbox'],'read-only')
        self.assertFalse(self.s.store.get('project',self.p['id'])['brief'])
        self.assertFalse(self.s.store.all('task'))
        data=self.s.breakdown(self.p['id'])['data'];adapter.result=dict(data,status='completed')
        job=self.s.breakdown(self.p['id'],'codex');self.drain()
        self.assertEqual(self.s.store.get('job',job['id'])['state'],'completed')
        self.assertFalse(self.s.store.all('work_item'))

    def test_delivery_receipt_links_user_message_to_its_real_job(self):
        frame=copy.deepcopy(self.s.store.all('proposal')[0]['data'])
        adapter=FakeAdapter(dict(frame,status='completed'),hold=True)
        self.s.adapter=adapter;self.s.settings({'mode':'codex'})
        result=self.s.discuss(self.p['id'],'A synthetic message with visible delivery.','codex')
        message=result['message']
        self.assertEqual(message['delivery'],{'method':'codex','job_id':result['id']})
        self.assertEqual(result['message_id'],message['id'])
        self.assertEqual(self.s.store.get('message',message['id']),message)
        self.assertEqual(self.s.store.get('job',result['id'])['state'],'running')
        adapter.release.set();self.drain()
        self.assertEqual(self.s.store.get('job',result['id'])['state'],'completed')
        self.assertEqual(self.s.store.get('message',message['id'])['delivery']['job_id'],result['id'])
        self.assertFalse(self.s.store.all('task'))

    def test_local_delivery_is_labeled_saved_without_a_model_job(self):
        result=self.s.discuss(self.p['id'],'A local note.')
        self.assertEqual(result['message']['delivery'],{'method':'local','proposal_id':result['id']})
        self.assertFalse(self.s.store.all('job'))

    def test_rejected_discussion_has_no_receipt_or_user_message(self):
        before=copy.deepcopy(self.s.store.all('message'))
        with self.assertRaises(Invalid):self.s.discuss(self.p['id'],'CLI is unavailable.','codex')
        self.assertEqual(self.s.store.all('message'),before)
        self.assertFalse(self.s.store.all('job'))

    def test_followup_context_keeps_proposed_questions_and_partial_findings(self):
        _,task=self.delegated_result()
        self.s.partial_result(task['id'],'Retain this finding, with full review still open.')
        proposal=self.s.store.all('proposal')[0]
        proposal['data']['questions']=['Which representative dataset should the first milestone use?']
        self.s.store.put('proposal',proposal)
        self.s.adapter=FakeAdapter(dict(proposal['data'],status='completed'))
        self.s.settings({'mode':'codex'})
        self.s.discuss(self.p['id'],'My answer to your first question is a synthetic sample.','codex');self.drain()
        context=json.loads(self.s.adapter.calls[0]['prompt'].split('\n')[-1])['project']
        self.assertEqual(context['proposal_history'][0]['data']['questions'],proposal['data']['questions'])
        self.assertEqual(context['proposal_history'][0]['state'],'suggested')
        self.assertEqual(context['findings'][0]['text'],'Retain this finding, with full review still open.')
        self.assertEqual(self.s.store.get('project',self.p['id'])['brief'],{})

    def test_malformed_model_proposal_cannot_update_project(self):
        self.s.adapter=FakeAdapter({'status':'completed','summary':'Missing proposal fields'})
        self.s.settings({'mode':'codex'})
        job=self.s.breakdown(self.p['id'],'codex');self.drain()
        self.assertEqual(self.s.store.get('job',job['id'])['state'],'failed')
        self.assertFalse(self.s.store.all('work_item'))

    def test_model_portfolio_advice_uses_vision_without_delegation(self):
        self.s.portfolio_preferences({'vision':'Prioritize traceable engineering evidence'})
        self.s.adapter=FakeAdapter({'status':'completed','summary':'Define the viewer demonstration first',
            'recommendations':[{'project_id':self.p['id'],'target_id':self.p['id'],'action':'project',
                                'next_step':'Define the import demonstration','reason':'This supports your overall engineering vision'}]})
        self.s.settings({'mode':'codex'})
        job=self.s.focus_advice();self.drain()
        self.assertEqual(self.s.store.get('job',job['id'])['state'],'completed')
        advice=self.s.portfolio_briefing()['model_advice']
        self.assertTrue(advice['fresh'])
        self.assertIn('traceable engineering evidence',self.s.adapter.calls[0]['prompt'])
        self.assertEqual(self.s.adapter.calls[0]['sandbox'],'read-only')
        self.assertFalse(self.s.store.all('task'))
        self.assertIsNone(self.s.preferences()['focus_project'])
        self.s.project({'priority':'maintain'},self.p['id'])
        self.assertFalse(self.s.portfolio_briefing()['model_advice']['fresh'])

    def test_portfolio_advice_rejects_unknown_targets(self):
        self.s.adapter=FakeAdapter({'status':'completed','summary':'Invalid advice',
            'recommendations':[{'project_id':self.p['id'],'target_id':uid(),'action':'piece','next_step':'Do work','reason':'Reason'}]})
        self.s.settings({'mode':'codex'})
        job=self.s.focus_advice();self.drain()
        self.assertEqual(self.s.store.get('job',job['id'])['state'],'failed')
        self.assertIsNone(self.s.portfolio_briefing()['model_advice'])

    def test_task_lifecycle_change_invalidates_portfolio_advice(self):
        item,task=self.delegated_result()
        self.s.adapter=FakeAdapter({'status':'completed','summary':'Review the returned result',
            'recommendations':[{'project_id':self.p['id'],'target_id':task['id'],'action':'review','next_step':'Review output','reason':'It is ready'}]})
        self.s.settings({'mode':'codex'})
        self.s.focus_advice();self.drain()
        self.assertTrue(self.s.portfolio_briefing()['model_advice']['fresh'])
        changed=self.s.store.get('task',task['id']);changed['state']='paused';self.s.store.put('task',changed)
        self.assertFalse(self.s.portfolio_briefing()['model_advice']['fresh'])


if __name__=='__main__': unittest.main()
