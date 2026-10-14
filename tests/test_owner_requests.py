"""Explicit request persistence, read-only projection and safe existing replies."""
import copy,json,tempfile,unittest
from unittest.mock import patch
from cos.adapter import completion
from cos.owner_requests import validate_requests,apply_request_update,owner_snapshot
from cos.progress import apply_progress,message_details
from cos.safety import Invalid
from cos.service import Service

def envelope(revision=1,state='needs_user',items=None):
    return {'version':1,'revision':revision,'state':state,'items':items if items is not None else ([{'id':'sample-rate','kind':'question','text':'10 Hz or 50 Hz?'}] if state=='needs_user' else [])}

class ContractTests(unittest.TestCase):
    def test_legacy_completion_and_optional_explicit_contract(self):
        old={'status':'blocked','summary':'Input missing','artifacts':[],'decisions':[],'next_steps':[]}
        self.assertEqual(completion(old),old)
        self.assertEqual(completion(dict(old,user_requests=envelope()))['user_requests'],envelope())
        with self.assertRaises(Invalid):completion(dict(old,unapproved_key=True))

    def test_bad_schema_kind_duplicates_revision_and_text(self):
        invalid=[dict(envelope(),revision=True),dict(envelope(),revision=0),dict(envelope(),items=[]),dict(envelope(),state='resolved'),dict(envelope(),unknown='x'),envelope(items=[{'id':'x','kind':'tool_approval','text':'x'}]),envelope(items=[{'id':'x','kind':'question','text':' '}]),envelope(items=[{'id':'x','kind':'question','text':'x'}]*2)]
        for value in invalid:
            with self.subTest(value=value),self.assertRaises(Invalid):validate_requests(value)

    def test_monotonic_sticky_idempotent_and_conflicting_updates(self):
        task={'state':'running'};apply_request_update(task,envelope(),'2026-10-13T00:00:00Z');before=copy.deepcopy(task['user_requests'])
        apply_progress(task,{'progress':'command_execution: completed','progress_kind':'activity'},'2026-10-13T00:00:01Z')
        self.assertEqual(task['user_requests'],before);self.assertEqual(task['state'],'running')
        self.assertFalse(apply_request_update(task,envelope(),'2026-10-13T00:00:02Z'))
        self.assertFalse(apply_request_update(task,envelope(items=[{'id':'other','kind':'approval','text':'Approve?'}]),'later'))
        self.assertIn('Conflicting',task['user_requests_error']);self.assertEqual(task['user_requests'],before)
        self.assertTrue(apply_request_update(task,envelope(2,'resolved'),'2026-10-13T00:00:03Z'))
        self.assertFalse(apply_request_update(task,envelope(),'later'));self.assertEqual(task['user_requests']['state'],'resolved')

    def test_no_prose_inference_and_legacy_explicit_decisions_only(self):
        task={'state':'blocked','latest_update':'Please approve the command. I need your input.'}
        self.assertEqual(owner_snapshot(task)['owner_attention']['state'],'none')
        self.assertNotIn('user_requests',message_details(task['latest_update']))
        task['decisions_needed']=['Which input source?'];before=copy.deepcopy(task)
        shown=owner_snapshot(task)['owner_attention'];self.assertEqual(shown['source'],'legacy_decisions');self.assertEqual(shown['items'][0]['text'],'Which input source?');self.assertEqual(task,before)
        task['state']='accepted';self.assertEqual(owner_snapshot(task)['owner_attention']['items'],[])

class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name,start=False)
        self.p=self.s.project({'name':'Synthetic attention test','goal':'No actual worker'})
        self.task={'id':'qa-task','project_id':self.p['id'],'state':'running','title':'Fixture worker','config':{'mode':'codex'},'updated':'2026-10-13T00:00:00Z','worker_pid':123,'history':[],'output_links':[]}
        self.s.store.put('task',self.task)
    def tearDown(self):self.s.close();self.tmp.cleanup()
    def update(self,value):self.s._update('qa-task',{'progress':'Explicit fixture update','user_requests':value})
    def task_value(self):return self.s.store.get('task','qa-task')
    def rows(self):return self.s.store.get('project',self.p['id'])['records']
    def test_materialized_once_and_gets_are_pure(self):
        self.update(envelope());self.update(envelope());self.assertEqual(len(self.rows()),1)
        row=self.rows()[0];self.assertEqual(row['text'],'10 Hz or 50 Hz?');self.assertEqual(row['status'],'open')
        before=list(self.s.store.db.iterdump())
        with patch.object(self.s,'launch',side_effect=AssertionError('launch forbidden')),patch.object(self.s.store,'put',side_effect=AssertionError('GET write forbidden')):
            for _ in range(3):self.assertEqual(self.s.snapshot()['tasks'][0]['owner_attention']['items'][0]['record_id'],row['id'])
        self.assertEqual(before,list(self.s.store.db.iterdump()));self.assertFalse(self.s.active)
    def test_answer_saves_context_but_does_not_resolve_or_resume(self):
        self.update(envelope());r=self.rows()[0]
        with patch.object(self.s,'launch',side_effect=AssertionError('launch forbidden')):
            self.s.resolve_batch([{'project_id':self.p['id'],'record_id':r['id'],'action':'answer','answer':'10 Hz'}])
        a=self.s.snapshot()['tasks'][0]['owner_attention'];self.assertEqual(a['state'],'needs_user');self.assertTrue(a['items'][0]['answered']);self.assertEqual(a['items'][0]['owner_answer'],'10 Hz');self.assertEqual(self.task_value()['state'],'running');self.assertFalse(self.s.active)
        self.update(envelope(2,'resolved'));self.assertEqual(self.s.snapshot()['tasks'][0]['owner_attention']['state'],'resolved');self.assertEqual(self.rows()[0]['status'],'answered')
    def test_approval_decision_is_not_execution_permission(self):
        self.update(envelope(items=[{'id':'placement','kind':'approval','text':'Approve instrument position?'}]));r=self.rows()[0]
        self.s.resolve_batch([{'project_id':self.p['id'],'record_id':r['id'],'action':'approve'}]);self.assertEqual(self.rows()[0]['status'],'approved');self.assertEqual(self.task_value()['state'],'running');self.assertFalse(self.s.active);self.assertEqual(self.s.store.all('plan'),[])
    def test_changed_or_withdrawn_request_cannot_be_answered(self):
        self.update(envelope());old=self.rows()[0]
        self.update(envelope(2,items=[{'id':'sample-rate','kind':'question','text':'20 Hz or 50 Hz?'}]));self.assertEqual(len(self.rows()),2);self.assertEqual(self.rows()[0]['status'],'withdrawn')
        with self.assertRaises(Invalid):self.s.resolve_batch([{'project_id':self.p['id'],'record_id':old['id'],'action':'answer','answer':'Old answer'}])
        version=self.s.store.get('project',self.p['id'])['version']
        self.update(envelope(3,'resolved'));self.assertTrue(all(r['status']=='withdrawn' for r in self.rows()))
        self.assertGreater(self.s.store.get('project',self.p['id'])['version'],version)
    def test_repeated_request_id_after_resolution_creates_fresh_control(self):
        self.update(envelope());self.update(envelope(2,'resolved'));self.update(envelope(3));self.assertEqual(len(self.rows()),2);self.assertEqual(self.rows()[-1]['status'],'open')
