"""Automatic CoS orientation uses mocked read-only calls, never paid models."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from cos.safety import Invalid
from cos.service import Service
from cos.store import uid
from test_app import FakeAdapter


FRAME = {'status': 'completed', 'summary': 'The synthetic viewer already has an import page. A small next step is to sketch one comparison plot.',
         'interpretation': 'Extend an existing viewer with a comparison plot.', 'milestone': '', 'success': '',
         'constraints': '', 'next_step': 'Sketch a comparison plot using the existing imported signal.', 'questions': []}


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.adapter = FakeAdapter(result=FRAME)
        self.s = Service(self.root/'data', adapter=self.adapter, start=False)
        self.s.settings({'mode': 'codex', 'schedule_enabled': False})

    def tearDown(self):
        self.adapter.release.set()
        self.s.close()
        self.tmp.cleanup()

    def project(self, **kwargs):
        return self.s.project(dict(vision='Add a comparison plot to a synthetic viewer.', **kwargs))

    def drain(self):
        deadline = time.monotonic()+3
        while time.monotonic()<deadline:
            self.s.tick()
            if not self.s.active and not any(r['state']=='pending' for r in self.s.store.all('setup_review')):
                return
            time.sleep(.01)
        self.fail('Mock setup review did not finish')

    def test_creation_commits_a_single_review_without_placeholder_or_delegation(self):
        p = self.project()
        review = self.s.store.get('setup_review', p['id'])
        self.assertEqual(review['state'], 'pending')
        self.assertEqual([m['role'] for m in self.s.store.all('message')], ['user'])
        self.assertFalse(self.s.store.all('proposal'))
        self.assertFalse(self.adapter.calls)
        self.assertEqual(self.s.request_project_review(p['id']), review)
        self.drain()
        review = self.s.store.get('setup_review', p['id'])
        self.assertEqual(review['state'], 'completed')
        self.assertEqual(len(self.adapter.calls), 1)
        self.assertEqual(len(self.s.store.all('proposal')), 1)
        self.assertEqual(self.s.store.get('project', p['id']), p)
        self.assertFalse(self.s.store.all('plan'))
        self.assertFalse(self.s.store.all('task'))
        self.assertFalse(self.s.store.all('work_item'))
        self.s.request_project_review(p['id']); self.drain()
        self.assertEqual(len(self.adapter.calls), 1)

    def test_supplied_folder_and_references_reach_read_only_setup_prompt(self):
        work = self.root/'work'; work.mkdir()
        (work/'index.html').write_text('<title>Synthetic viewer</title>')
        ref = self.s.import_reference('reference.txt', b'Synthetic method notes')
        p = self.project(cwd=str(work), reference_ids=[ref['id']])
        self.drain()
        call = self.adapter.calls[0]
        self.assertEqual(call['cwd'], str(work))
        self.assertEqual(call['sandbox'], 'read-only')
        context = json.loads(call['prompt'].split('\n')[-1])['project']
        self.assertEqual(context['interaction_stage'], 'setup')
        self.assertTrue(context['working_folder_provided'])
        self.assertEqual(Path(context['reference_files'][0]['path']).read_bytes(), b'Synthetic method notes')
        self.assertIn('inspect the supplied working directory read-only', call['prompt'])
        self.assertIn('Do not implement anything or run project code', call['prompt'])
        self.assertEqual((work/'index.html').read_text(), '<title>Synthetic viewer</title>')
        self.assertEqual(self.s.store.get('project',p['id'])['reference_files'], [ref])

    def test_blank_working_folder_is_a_valid_start(self):
        p = self.project()
        self.assertEqual(list(Path(p['cwd']).iterdir()), [])
        self.drain()
        context = json.loads(self.adapter.calls[0]['prompt'].split('\n')[-1])['project']
        self.assertFalse(context['working_folder_provided'])
        self.assertIn('An empty folder is valid; it is not a blocker', self.adapter.calls[0]['prompt'])
        self.assertEqual(self.s.store.get('setup_review',p['id'])['state'], 'completed')
        self.assertEqual(list(Path(p['cwd']).iterdir()), [])

    def test_busy_slots_and_writer_locks_leave_intake_pending(self):
        p = self.project()
        self.s.active = {str(i): {'cwd': p['cwd'], 'access':'read-only'} for i in range(2)}
        self.s._start_project_reviews()
        self.assertFalse(self.adapter.calls)
        self.s.active = {'writer': {'cwd':p['cwd'], 'access':'workspace-write'}}
        self.s._start_project_reviews()
        self.assertEqual(self.s.store.get('setup_review',p['id'])['state'], 'pending')
        self.s.active.clear(); self.drain()
        self.assertEqual(len(self.adapter.calls), 1)

    def test_pending_review_uses_latest_saved_context(self):
        p = self.project()
        updated = self.s.project({'vision':'The owner now wants an export preview.'}, p['id'])
        self.drain()
        context = json.loads(self.adapter.calls[0]['prompt'].split('\n')[-1])['project']
        self.assertEqual(context['vision'], updated['vision'])
        self.assertEqual(self.s.store.get('setup_review',p['id'])['based_on_version'], updated['version'])

    def test_cancelled_pending_review_never_runs_until_explicit_retry(self):
        p = self.project()
        self.s.cancel_project_review(p['id']); self.s.tick()
        self.assertFalse(self.adapter.calls)
        self.s.request_project_review(p['id']); self.drain()
        self.assertEqual(len(self.adapter.calls), 1)

    def test_save_survives_preflight_failure_and_retry_is_explicit(self):
        self.adapter.capabilities = None
        with patch.object(self.adapter, 'preflight', side_effect=Invalid('Synthetic CLI unavailable')):
            p = self.project(); self.s.tick(); self.s.tick()
        review = self.s.store.get('setup_review',p['id'])
        self.assertEqual(review['state'], 'failed')
        self.assertIn('Synthetic CLI unavailable', review['progress'])
        self.assertEqual(self.s.store.get('project',p['id']), p)
        self.assertFalse(self.adapter.calls)
        self.assertFalse(self.s.store.all('proposal'))
        self.adapter.capabilities={'ok':True}
        self.s.request_project_review(p['id']); self.drain()
        self.assertEqual(len(self.adapter.calls), 1)

    def test_integrity_failure_prevents_a_model_call_and_keeps_project(self):
        ref = self.s.import_reference('notes.txt', b'Original notes')
        p = self.project(reference_ids=[ref['id']])
        self.s.reference_file(ref['id']).write_bytes(b'Changed notes')
        self.s.tick()
        self.assertEqual(self.s.store.get('setup_review',p['id'])['state'], 'failed')
        self.assertEqual(self.s.store.get('project',p['id']), p)
        self.assertFalse(self.adapter.calls)

    def test_malformed_model_result_cannot_create_a_proposal(self):
        self.adapter.result={'status':'completed','summary':'Missing fields'}
        p = self.project(); self.drain()
        self.assertEqual(self.s.store.get('setup_review',p['id'])['state'], 'failed')
        self.assertFalse(self.s.store.all('proposal'))
        self.assertFalse(self.s.store.all('task'))

    def test_pending_review_survives_restart_without_replaying_completed_review(self):
        p = self.project()
        self.s.close(); self.s=Service(self.root/'data',adapter=self.adapter,start=False)
        self.drain()
        self.s.close(); self.s=Service(self.root/'data',adapter=self.adapter,start=False)
        self.s.tick()
        self.assertEqual(len(self.adapter.calls), 1)
        self.assertEqual(self.s.store.get('setup_review',p['id'])['state'],'completed')

    def test_interrupted_review_requires_old_process_confirmation(self):
        p = self.project(); review=self.s.store.get('setup_review',p['id'])
        jid=uid()
        self.s.store.put('job',{'id':jid,'project_id':p['id'],'kind':'intake','cwd':p['cwd'],'state':'running','progress':'Synthetic crash'})
        review.update(state='running',job_id=jid);self.s.store.put('setup_review',review)
        self.s.close();self.s=Service(self.root/'data',adapter=self.adapter,start=False)
        self.assertEqual(self.s.store.get('setup_review',p['id'])['state'],'interrupted')
        self.s.tick();self.assertFalse(self.adapter.calls)
        with self.assertRaises(Invalid):self.s.request_project_review(p['id'])
        self.s.stop_job(jid,confirmed_stopped=True)
        self.s.request_project_review(p['id']);self.drain()
        self.assertEqual(len(self.adapter.calls),1)

    def test_running_context_is_frozen_and_stale_suggestion_cannot_be_adopted(self):
        self.adapter.hold=True
        p=self.project();self.s.tick()
        updated=self.s.project({'vision':'A later owner vision'},p['id'])
        self.adapter.release.set();self.drain()
        proposal=self.s.store.all('proposal')[0]
        self.assertEqual(proposal['based_on_version'],p['version'])
        self.assertNotEqual(proposal['based_on_version'],updated['version'])
        with self.assertRaises(Invalid):self.s.adopt_proposal(proposal['id'],'adopt')
        self.assertFalse(self.s.store.all('task'))

    def test_local_mode_does_not_claim_ai_orientation_or_queue_calls(self):
        self.s.settings({'mode':'simulated'})
        p=self.project();self.s.tick()
        self.assertFalse(self.s.store.all('setup_review'))
        self.assertFalse(self.adapter.calls)
        self.assertIn('not AI',self.s.store.all('proposal')[0]['basis'])
        self.assertNotIn('Review the existing project work',self.s.store.all('message')[-1]['text'])


if __name__=='__main__':
    unittest.main()
