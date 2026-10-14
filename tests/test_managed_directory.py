"""Managed Git checkouts remain usable when runtime lives inside the app folder."""
import copy
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from cos.agents import git
from cos.safety import Invalid
from cos.service import Service
from test_app import FakeAdapter, GOOD


class ManagedDirectoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.app = self.root / 'app'
        self.source = self.root / 'source'
        self.source.mkdir()
        git(self.source, 'init')
        git(self.source, 'config', 'user.name', 'Fixture')
        git(self.source, 'config', 'user.email', 'fixture@example.invalid')
        (self.source / 'input.txt').write_text('Owner input')
        git(self.source, 'add', '.')
        git(self.source, 'commit', '-m', 'Fixture')
        self.app_path = patch('cos.service.__file__', str(self.app / 'cos' / 'service.py'))
        self.app_path.start()
        result = dict(GOOD, artifacts=['research.txt'])
        self.adapter = FakeAdapter(result, writer=lambda cwd: (cwd / 'research.txt').write_text('Agent output'))
        self.s = Service(self.app / 'runtime', adapter=self.adapter, start=False)
        self.p = self.s.project({'vision': 'Inspect the input.', 'cwd': str(self.source)})
        self.s.settings({'mode': 'codex', 'schedule_enabled': False})

    def tearDown(self):
        self.s.close()
        self.app_path.stop()
        self.tmp.cleanup()

    def finish_task(self):
        started = self.s.start_agents({'project_id': self.p['id'], 'agents': [{'instructions': 'Inspect the input.'}], 'isolate': True})
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            self.s.tick()
            task = self.s.store.get('task', started['task_ids'][0])
            if task['state'] not in ('queued', 'running', 'stopping'):
                return task
            time.sleep(.005)
        self.fail('Fixture task did not finish')

    def test_agent_runs_and_returns_snapshots_from_runtime_inside_app_source(self):
        before = git(self.source, 'status', '--porcelain').stdout
        task = self.finish_task()
        self.assertEqual(task['state'], 'ready_for_review', task.get('error'))
        self.assertEqual(len(self.adapter.calls), 1)
        self.assertTrue(Path(self.adapter.calls[0]['cwd']).is_relative_to(self.app / 'runtime' / 'worktrees'))
        self.assertIn('research.txt', [link.get('source_path') for link in task['output_links']])
        self.assertEqual(git(self.source, 'status', '--porcelain').stdout, before)
        self.assertFalse((self.source / 'research.txt').exists())
        follow = self.s.reply_agent(task['id'], 'Continue with the same checkout.')
        self.assertEqual(self.s.task_directory(follow), task['context']['cwd'])

    def test_handoff_recovery_uses_the_same_verified_checkout(self):
        task = self.finish_task()
        task['state'] = 'blocked'
        self.s.store.put('task', task)
        recovered = self.s.recover_handoff(task['id'], json.dumps(self.adapter.result), task['session_id'], 'Fixture retained report')
        self.assertIn('research.txt', [link.get('source_path') for link in recovered['output_links']])
        self.assertEqual(len(self.adapter.calls), 1)

    def test_app_storage_other_checkouts_and_wrong_git_source_remain_protected(self):
        task = self.finish_task()
        for folder in (self.app, self.s.data, self.s.data / 'outputs', self.s.data / 'worktrees'):
            with self.subTest(folder=folder), self.assertRaises(Invalid):
                self.s.task_directory(dict(task, worktree=None, context={'cwd': str(folder)}))
            with self.subTest(forged_folder=folder), self.assertRaises(Invalid):
                self.s.task_directory(dict(task, context={'cwd': str(folder)}))
        wrong = copy.deepcopy(task)
        wrong['worktree']['workspace_id'] = '../outputs'
        with self.assertRaises(Invalid): self.s.task_directory(wrong)
        other = self.root / 'other'
        other.mkdir()
        git(other, 'init')
        wrong = copy.deepcopy(task)
        wrong['worktree']['source'] = str(other)
        with self.assertRaises(Invalid): self.s.task_directory(wrong)
        sibling = self.s.data / 'worktrees' / 'other-agent'
        sibling.mkdir()
        with self.assertRaises(Invalid): self.s.task_directory(dict(task, context={'cwd': str(sibling)}))

    def test_symlink_cannot_redirect_the_managed_checkout(self):
        task = self.finish_task()
        folder = Path(task['worktree']['path'])
        retained = folder.with_name('retained-checkout')
        folder.rename(retained)
        folder.symlink_to(retained, target_is_directory=True)
        with self.assertRaises(Invalid): self.s.task_directory(task)
