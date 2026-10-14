"""Exercise structured CoS calls through the real adapter with synthetic CLI output."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

from cos.adapter import CodexAdapter
from cos.service import Service
from test_app import FakeProcess, fixture_events
from test_intake import FRAME


class CoordinatorContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.response = copy.deepcopy(FRAME)
        self.calls = []

        def help_only(args, **kwargs):
            return subprocess.CompletedProcess(args, 0,
                'codex-cli fixture --config --json --sandbox --model --output-schema '
                '--skip-git-repo-check SESSION_ID', '')

        def output(args, **kwargs):
            self.calls.append(args)
            return FakeProcess(fixture_events(self.response))

        self.s = Service(self.root / 'data', start=False,
                         adapter=CodexAdapter(runner=help_only, popen=output))
        self.s.settings({'mode': 'codex', 'executable': sys.executable,
                         'model': 'fixture', 'schedule_enabled': False})
        self.s.preflight()
        folder = self.root / 'project'
        folder.mkdir()
        self.p = self.s.project({'vision': 'Compare synthetic signals.', 'cwd': str(folder)})

    def tearDown(self):
        self.s.close()
        self.tmp.cleanup()

    def drain(self):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            self.s.tick()
            if not self.s.active and not any(r['state'] == 'pending' for r in self.s.store.all('setup_review')):
                return
            time.sleep(.005)
        self.fail('Synthetic coordinator did not finish')

    def completed_job(self, jid):
        self.drain()
        job = self.s.store.get('job', jid)
        self.assertEqual(job['state'], 'completed', job['progress'])
        self.assertTrue(job['result']['execution_verified'])
        self.assertEqual(json.loads(job['result']['agent_report']), self.response)
        self.assertTrue(job['result']['session_id'])
        self.assertFalse(self.s.store.all('task'))
        return job

    def test_intake_and_conversation_keep_model_fields_separate_from_adapter_evidence(self):
        self.drain()
        review = self.s.store.get('setup_review', self.p['id'])
        self.assertEqual(review['state'], 'completed', review['progress'])
        self.completed_job(review['job_id'])
        self.assertEqual(len(self.calls), 1)
        original = self.s.store.get('project', self.p['id'])
        job = self.s.discuss(self.p['id'], 'Explain the comparison.', 'codex')
        self.completed_job(job['id'])
        for proposal in self.s.store.all('proposal'):
            self.assertEqual(proposal['data'], {k: v for k, v in FRAME.items() if k != 'status'})
        self.assertEqual(self.s.store.get('project', self.p['id'])['vision'], original['vision'])

    def test_workmap_and_focus_advice_accept_real_adapter_evidence(self):
        self.s.cancel_project_review(self.p['id'])
        self.response = {'status': 'completed', 'summary': 'One useful piece.', 'items': [{
            'key': 'compare', 'title': 'Compare signals', 'purpose': 'Explore the supplied inputs.',
            'outcome': 'A comparison plot.', 'recommendation': 'Keep this bounded.',
            'kind': 'investigation', 'criteria': ['Explain the comparison.'], 'depends_on': []}]}
        job = self.s.breakdown(self.p['id'], 'codex')
        self.completed_job(job['id'])
        self.assertFalse(self.s.store.all('work_item'))
        self.response = {'status': 'completed', 'summary': 'Review the saved direction.',
                         'recommendations': [{'project_id': self.p['id'], 'target_id': self.p['id'],
                            'action': 'project', 'next_step': 'Choose an input.', 'reason': 'It anchors the comparison.'}]}
        job = self.s.focus_advice()
        self.completed_job(job['id'])
        self.assertEqual(self.s.store.get('focus_advice', 'latest')['result']['recommendations'], self.response['recommendations'])

    def test_planning_and_project_assignment_accept_real_adapter_evidence(self):
        self.s.cancel_project_review(self.p['id'])
        self.response = {'status': 'completed', 'summary': 'A bounded plot task.', 'suggestions': [],
                         'tasks': [{'title': 'Make the plot', 'goal': 'A useful comparison.',
                            'purpose': 'Implement the comparison plot.', 'criteria': ['Compare both inputs.'],
                            'access': 'workspace-write', 'expected_outputs': ['plot.html']}]}
        job = self.s.plan(self.p['id'], 'Make a comparison plot.', 'Fixture', method='codex')
        self.completed_job(job['id'])
        self.assertEqual(len(self.s.store.all('plan')), 1)
        job = self.s.prepare_project_assignment(self.p['id'], 'codex')
        job = self.completed_job(job['id'])
        self.assertEqual(self.s.store.get('plan', job['plan_id'])['scope'], 'project')

    def test_unknown_or_missing_model_fields_still_cannot_become_proposals(self):
        self.s.cancel_project_review(self.p['id'])
        for response in (dict(FRAME, unexpected='unsupported'),
                         {key: value for key, value in FRAME.items() if key != 'interpretation'}):
            with self.subTest(fields=sorted(response)):
                self.response = response
                job = self.s.discuss(self.p['id'], 'Malformed fixture.', 'codex')
                self.drain()
                job = self.s.store.get('job', job['id'])
                self.assertEqual(job['state'], 'blocked')
                self.assertIn('Invalid project proposal contract', job['result']['handoff_issues'][0])
                self.assertFalse(self.s.store.all('proposal'))
                self.assertFalse(self.s.store.all('task'))
