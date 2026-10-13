"""Research grants are assignment-scoped, frozen and routed on resume."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import test_app
from cos.safety import Invalid
from cos.service import Service, normalized_spec


class ResearchAdapterTests(unittest.TestCase):
    setUp = test_app.AdapterTests.setUp

    def test_grant_changes_only_network_on_exact_session(self):
        baseline=self.adapter.argv(self.config,'/tmp','workspace-write','schema.json',test_app.SID)
        approved=self.adapter.argv(self.config,'/tmp','workspace-write','schema.json',test_app.SID,research_access=True)
        self.assertEqual(approved,[x.replace('network_access=false','network_access=true') for x in baseline])
        self.assertIn(test_app.SID,approved)
        self.assertNotIn('--last',approved)
        self.assertIn('approvals_reviewer="user"',approved)

    def test_invalid_or_read_only_grants_are_refused(self):
        for access,grant in [('read-only',True),('workspace-write','yes'),('workspace-write',1)]:
            with self.subTest(access=access,grant=grant),self.assertRaises(Invalid):
                self.adapter.argv(self.config,'/tmp',access,'schema.json',research_access=grant)


class ResearchServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.work=self.root/'project';self.work.mkdir()
        self.adapter=test_app.FakeAdapter(result=dict(test_app.GOOD,status='blocked',summary='A source is missing.'))
        self.s=Service(self.root/'data',adapter=self.adapter,start=False)
        self.s.settings({'mode':'codex'})
        self.p=self.s.project({'name':'Source research','goal':'Inspect a public handbook','cwd':str(self.work)})

    def tearDown(self):
        self.s.close();self.tmp.cleanup()

    def draft(self,grant=False):
        return self.s._draft(self.p['id'],'Research a handbook','Owner',[
            {'title':'Read the handbook','purpose':'Retrieve and inspect public source figures.',
             'criteria':['Report source provenance'],'access':'workspace-write',
             'expected_outputs':['research.txt'],'research_access':grant}], 'Owner brief')

    drain = test_app.ServiceTests.drain

    def test_default_off_and_strict_boolean(self):
        raw=self.draft()['specs'][0];self.assertFalse(raw['research_access'])
        for value in ['true',1,None]:
            with self.subTest(value=value),self.assertRaises(Invalid):
                normalized_spec(dict(raw,research_access=value))
        with self.assertRaises(Invalid):normalized_spec(dict(raw,access='read-only',research_access=True))

    def test_editing_grant_requires_renewed_approval(self):
        plan=self.draft();self.s.approve(plan['id'],plan['revision'])
        specs=copy.deepcopy(plan['specs']);specs[0]['research_access']=True
        revised=self.s.edit_plan(plan['id'],plan['revision'],specs)
        self.assertEqual(revised['state'],'draft');self.assertNotIn('approval',revised)
        with self.assertRaises(Invalid):self.s.launch(plan['id'])
        self.assertEqual(self.s.store.all('task'),[])

    def test_tampering_with_grant_after_approval_is_refused(self):
        plan=self.draft();plan=self.s.approve(plan['id'],plan['revision'])
        plan['specs'][0]['research_access']=True;self.s.store.put('plan',plan)
        with self.assertRaises(Invalid):self.s.launch(plan['id'])
        self.assertFalse(self.adapter.calls)

    def test_approved_grant_routes_to_worker_and_only_that_assignment(self):
        plan=self.draft(True);approved=self.s.approve(plan['id'],plan['revision'])
        self.assertTrue(approved['approval']['payload']['specs'][0]['research_access'])
        self.assertFalse(self.adapter.calls);self.assertEqual(self.s.store.all('task'),[])
        launched=self.s.launch(plan['id']);self.drain()
        task=self.s.store.get('task',launched['task_ids'][0]);call=self.adapter.calls[-1]
        self.assertTrue(task['research_access']);self.assertTrue(call['research_access'])
        self.assertIn('owner explicitly approved public web research',call['prompt'])
        self.assertTrue(json.loads(call['prompt'].split('\n')[-1])['assignment']['research_access'])
        self.assertNotIn('research_access',self.s.config())
        next_plan=self.draft();self.s.approve(next_plan['id'],next_plan['revision']);self.s.launch(next_plan['id']);self.drain()
        self.assertFalse(self.adapter.calls[-1]['research_access'])

    def test_revision_can_grant_research_and_resume_the_same_session(self):
        plan=self.draft();self.s.approve(plan['id'],plan['revision']);launched=self.s.launch(plan['id']);self.drain()
        old=self.s.store.get('task',launched['task_ids'][0])
        revised=self.s.action(old['id'],'revise','Resume after approving public source downloads.')
        self.assertFalse(revised['specs'][0]['research_access'])
        specs=copy.deepcopy(revised['specs']);specs[0]['research_access']=True
        revised=self.s.edit_plan(revised['id'],revised['revision'],specs)
        self.assertEqual(revised['specs'][0]['resume_session'],old['session_id'])
        self.s.approve(revised['id'],revised['revision']);self.s.launch(revised['id']);self.drain()
        self.assertEqual(self.adapter.calls[-1]['session'],old['session_id'])
        self.assertTrue(self.adapter.calls[-1]['research_access'])
        newest=self.s.store.all('task')[-1]
        again=self.s.action(newest['id'],'revise','Inspect one more public source.')
        self.assertTrue(again['specs'][0]['research_access'])
        self.assertEqual(again['state'],'draft')


class ResearchPresentationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'Node is needed for the UI checks')
    def test_permission_visibility_default_and_launched_grant(self):
        source=Path(__file__).resolve().parents[1]/'static/task-feedback.js'
        script=r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={document:{addEventListener:()=>{}},setInterval:()=>{},planModal:()=>{}};
vm.createContext(context);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),context);
let html=vm.runInContext("researchPermissionHTML({access:'workspace-write'})",context);
assert.ok(html.includes('name="research_access"'));assert.ok(!html.includes('checked'));
assert.ok(html.includes('without a domain allowlist'));assert.ok(html.includes('Browser permissions stay separate'));
html=vm.runInContext("researchPermissionHTML({access:'read-only'})",context);assert.ok(html.includes('disabled'));
html=vm.runInContext("researchPermissionHTML({access:'workspace-write',research_access:true},true)",context);
assert.ok(html.includes('checked'));assert.ok(html.includes('disabled'));
'''
        result=subprocess.run([shutil.which('node'),'-e',script,str(source)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
