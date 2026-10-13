"""Live view uses existing private GET state; fixture runs never launch jobs."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import unittest
from unittest.mock import patch
import test_lunar_base

class LunarLiveHTTPTests(unittest.TestCase):
    setUp=test_lunar_base.LunarBaseTests.setUp
    tearDown=test_lunar_base.LunarBaseTests.tearDown
    request=test_lunar_base.LunarBaseTests.request
    def test_live_view_private_route_and_existing_state_are_read_only(self):
        self.assertEqual(self.request('/lunar-base/?mode=live',False)[0],401)
        before=list(self.service.store.db.iterdump())
        with patch.object(self.service,'launch',side_effect=AssertionError('launch forbidden')), \
             patch.object(self.service,'_coordinate',side_effect=AssertionError('coordinator forbidden')), \
             patch.object(self.service.store,'put',side_effect=AssertionError('record mutation forbidden')), \
             patch.object(self.service.store,'audit',side_effect=AssertionError('audit mutation forbidden')):
            for _ in range(4):
                self.assertEqual(self.request('/lunar-base/?mode=live')[0],200)
                status,body,_=self.request('/api/state')
                self.assertEqual(status,200)
                state=json.loads(body)
                self.assertIn('projects',state)
                self.assertIn('tasks',state)
                self.assertIn('jobs',state)
        self.assertEqual(list(self.service.store.db.iterdump()),before)
        self.assertEqual(self.service.active,{})

    def test_snapshot_changes_are_reflected_without_view_mutations(self):
        # Fixture-only store, isolated from every real project record.
        project=self.service.project({'name':'Fixture','goal':'Synthetic state mapping fixture'})
        task={'id':'fixture-task','project_id':project['id'],'state':'running','title':'Fixture worker',
            'config':{'mode':'codex'},'worker_pid':123,'started_at':'2026-10-13T04:00:00Z',
            'updated':'2026-10-13T04:00:00Z','progress':'Fixture activity','output_links':[]}
        self.service.store.put('task',task)
        first=json.loads(self.request('/api/state')[1])
        self.assertEqual(first['tasks'][0]['state'],'running')
        task.update(state='blocked',progress='Fixture blocker')
        self.service.store.put('task',task)
        before=list(self.service.store.db.iterdump())
        second=json.loads(self.request('/api/state')[1])
        self.assertEqual(second['tasks'][0]['state'],'blocked')
        self.assertEqual(list(self.service.store.db.iterdump()),before)

class LunarLiveSourceTests(unittest.TestCase):
    def test_pure_mapping_contract(self):
        node=shutil.which('node')
        if not node:self.skipTest('Node unavailable')
        root=Path(__file__).resolve().parent.parent
        result=subprocess.run([node,str(root/'static/lunar-base/source/test_live_model.cjs')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_only_get_is_exposed_in_live_client(self):
        source=(Path(__file__).resolve().parent.parent/'static/lunar-base/source/live-view.js').read_text()
        self.assertIn("fetch('/api/state',{method:'GET'",source)
        for path in ['/api/launch','/api/action','/api/approve','/api/settings','/api/discuss']:
            self.assertNotIn(path,source)
        self.assertNotIn("method:'POST'",source)
        self.assertIn("credentials:'same-origin'",source)
        self.assertIn("cos.lunar.layout.v1",source)
