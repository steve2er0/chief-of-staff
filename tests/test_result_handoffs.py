"""Realistic deliveries survive report and capture defects without false acceptance."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import test_app
from cos.adapter import completion
from cos.safety import Invalid


class ReportRetentionTests(unittest.TestCase):
    setUp = test_app.AdapterTests.setUp
    execute = test_app.AdapterTests.execute

    def test_forty_artifacts_and_long_summary_are_accepted(self):
        report=dict(test_app.GOOD,summary='Detailed verification. '*2000,artifacts=['file-%d.txt'%i for i in range(40)])
        self.assertEqual(completion(copy.deepcopy(report)),report)
        result,_,_=self.execute(test_app.fixture_events(report))
        self.assertEqual(result['status'],'completed')
        self.assertEqual(json.loads(result['agent_report']),report)

    def test_malformed_report_retains_original_and_names_missing_fields(self):
        raw={'status':'completed','summary':'Useful work is saved','artifacts':['result.txt']}
        result,_,_=self.execute(test_app.fixture_events(raw))
        self.assertEqual(result['status'],'blocked')
        self.assertEqual(result['summary'],raw['summary'])
        self.assertEqual(json.loads(result['agent_report']),raw)
        self.assertIn('decisions, next_steps',result['handoff_issues'][0])

    def test_cli_failure_preserves_report_and_exact_error(self):
        result,_,_=self.execute(code=2,stderr='Solver process exited unexpectedly')
        self.assertEqual(result['status'],'failed')
        self.assertEqual(result['summary'],test_app.GOOD['summary'])
        self.assertIn('Solver process exited unexpectedly',result['handoff_issues'][0])

    def test_malformed_field_names_the_entry_to_correct(self):
        raw=dict(test_app.GOOD,decisions=['Valid decision',None])
        result,_,_=self.execute(test_app.fixture_events(raw))
        self.assertEqual(result['status'],'blocked')
        self.assertIn("'decisions' entry 2",result['handoff_issues'][0])
        self.assertEqual(json.loads(result['agent_report']),raw)


class FileHandoffTests(unittest.TestCase):
    def setUp(self):
        test_app.ServiceTests.setUp(self)
        self.adapter=test_app.FakeAdapter();self.s.adapter=self.adapter
        self.work=self.root/'project';self.work.mkdir()
        self.p=self.s.project({'cwd':str(self.work)},self.p['id']);self.s.settings({'mode':'codex'})
    tearDown = test_app.ServiceTests.tearDown
    draft = test_app.ServiceTests.draft
    launch = test_app.ServiceTests.launch
    drain = test_app.ServiceTests.drain

    def run_report(self,report,writer):
        self.adapter.result=report;self.adapter.writer=writer
        plan=self.launch(access='workspace-write');self.drain()
        return self.s.store.get('task',plan['task_ids'][0])

    def test_directory_in_large_delivery_keeps_all_regular_files_and_report(self):
        names=['file-%02d.txt'%i for i in range(39)]+['result.txt']
        def write(cwd):
            for name in names:(cwd/name).write_text('Verified output '+name)
            (cwd/'tmp').mkdir()
        report=dict(test_app.GOOD,artifacts=names+['tmp/'],summary='Changes: tool implemented.\nChecks: all tests passed.\nLimits: browser check pending.')
        task=self.run_report(report,write)
        self.assertEqual(task['state'],'ready_for_review')
        self.assertEqual(task['result']['summary'],report['summary'])
        self.assertEqual(len([x for x in task['output_links'] if x.get('source_path')]),40)
        self.assertIn('tmp/',task['handoff_issues'][0]);self.assertIn('individual files',task['handoff_issues'][0])
        raw=json.loads(self.s.output(task['id'],'agent-report.txt').read_text())
        self.assertEqual(raw['artifacts'],report['artifacts'])
        self.assertFalse(self.s.snapshot()['attention'])
        self.assertTrue(task['managed_agent'])
        self.assertEqual(self.s.store.get('project',self.p['id'])['accepted_results'],[])
        continuation=self.s.action(task['id'],'resume','Correct the directory entry and retain the files.')
        self.assertEqual(continuation['specs'][0]['resume_context']['handoff_issues'],task['handoff_issues'])

    def test_missing_and_unsafe_entries_do_not_hide_valid_files(self):
        report=dict(test_app.GOOD,artifacts=['result.txt','missing.txt','../outside.txt',None])
        task=self.run_report(report,lambda p:(p/'result.txt').write_text('Valid result'))
        self.assertEqual(task['state'],'ready_for_review')
        self.assertEqual(len(task['handoff_issues']),3)
        self.assertTrue(any('missing.txt' in x for x in task['handoff_issues']))
        self.assertTrue(any('../outside.txt' in x for x in task['handoff_issues']))
        self.assertTrue(any('entry 4' in x for x in task['handoff_issues']))
        files=[x for x in task['output_links'] if x.get('source_path')]
        self.assertEqual([x['source_path'] for x in files],['result.txt'])
        self.assertEqual(self.s.output(task['id'],files[0]['name']).read_text(),'Valid result')

    def test_larger_file_is_streamed_and_acceptance_still_checks_hashes(self):
        size=12*1024*1024
        def write(p):
            with (p/'result.txt').open('wb') as f:f.write(b'x'*size)
        with patch.object(Path,'read_bytes',side_effect=AssertionError('Do not load snapshots into memory')):
            task=self.run_report(copy.deepcopy(test_app.GOOD),write)
            self.assertEqual(task['state'],'ready_for_review')
            artifact=next(x for x in task['output_links'] if x.get('source_path'))
            self.assertEqual(self.s.output(task['id'],artifact['name']).stat().st_size,size)
            self.s.action(task['id'],'accept','Reviewed large fixture')

    def test_storage_failure_preserves_report_and_identifies_recovery(self):
        with patch('cos.results.shutil.disk_usage',return_value=shutil._ntuple_diskusage(100,100,0)):
            task=self.run_report(copy.deepcopy(test_app.GOOD),lambda p:(p/'result.txt').write_text('Saved on disk'))
        self.assertEqual(task['state'],'ready_for_review')
        self.assertIn('disk space',task['handoff_issues'][0])
        self.assertIn('Free disk space',task['handoff_issues'][0])
        self.assertTrue(self.s.output(task['id'],'agent-report.txt').is_file())

    def test_unexpected_capture_exception_keeps_agent_summary(self):
        with patch('cos.service.capture_result',side_effect=OSError('Snapshot destination is unavailable')):
            task=self.run_report(copy.deepcopy(test_app.GOOD),lambda p:(p/'result.txt').write_text('Output'))
        self.assertEqual(task['state'],'blocked')
        self.assertEqual(task['result']['summary'],test_app.GOOD['summary'])
        self.assertIn('Snapshot destination is unavailable',task['handoff_issues'][0])

    def test_processed_report_storage_error_retains_original_report_and_files(self):
        real_write=Path.write_bytes
        def write(path,data):
            if path.name=='completion.json':raise OSError('Cannot write processed completion report')
            return real_write(path,data)
        with patch.object(Path,'write_bytes',write):
            task=self.run_report(dict(test_app.GOOD,agent_report=json.dumps(test_app.GOOD)),lambda p:(p/'result.txt').write_text('Valid saved file'))
        self.assertEqual(task['state'],'blocked')
        self.assertEqual(task['result']['summary'],test_app.GOOD['summary'])
        self.assertTrue(self.s.output(task['id'],'agent-report.txt').is_file())
        files=[x for x in task['output_links'] if x.get('source_path')]
        self.assertEqual(len(files),1);self.assertTrue(files[0]['partial'])

    def test_legacy_recovery_keeps_report_files_and_previous_capture_without_launching(self):
        task=self.run_report(dict(test_app.GOOD,status='blocked'),lambda p:(p/'result.txt').write_text('Retained file'))
        original=json.dumps(dict(test_app.GOOD,status='blocked',artifacts=['result.txt'],summary='Checks: saved tests passed.\nLimits: print check pending.'))
        calls=len(self.adapter.calls)
        recovered=self.s.recover_handoff(task['id'],original,task['session_id'],'Captured CLI final response')
        self.assertEqual(recovered['state'],'blocked');self.assertEqual(len(self.adapter.calls),calls)
        self.assertEqual(len(recovered['handoff_recoveries']),1)
        link=next(x for x in recovered['output_links'] if x['label']=='Original agent report')
        self.assertEqual(self.s.output(task['id'],link['name']).read_text(),original)
        self.assertEqual(len([x for x in recovered['output_links'] if x.get('source_path')]),1)
        with self.assertRaises(Invalid):self.s.action(task['id'],'accept')

    def test_recovery_rejects_other_session_and_never_promotes_claimed_completion(self):
        task=self.run_report(dict(test_app.GOOD,status='blocked'),lambda p:(p/'result.txt').write_text('File'))
        with self.assertRaises(Invalid):self.s.recover_handoff(task['id'],json.dumps(test_app.GOOD),test_app.SID2,'Wrong session')
        recovered=self.s.recover_handoff(task['id'],json.dumps(test_app.GOOD),task['session_id'],'Recovered completed claim')
        self.assertEqual(recovered['state'],'blocked');self.assertEqual(recovered['result']['reported_status'],'completed')

    def test_followup_evidence_preserves_report_and_only_clears_resolved_check(self):
        task=self.run_report(dict(test_app.GOOD,status='blocked'),lambda p:(p/'result.txt').write_text('File'))
        def check(id,status):return {'id':id,'status':status,'label':id,'details':'Evidence '+id,'source':'Owner observation'}
        updated=self.s.handoff_checks(task['id'],[check('import','passed'),check('offline','pending')])
        self.assertEqual(updated['result'],task['result']);self.assertEqual(updated['state'],'blocked')
        self.assertEqual(updated['handoff_issues'],[])
        updated=self.s.handoff_checks(task['id'],[check('offline','passed')])
        self.assertEqual(len(updated['validation_history']),3);self.assertEqual(updated['handoff_issues'],[])
        self.assertEqual(updated['state'],'blocked')

    def test_recovery_supplement_preserves_original_report(self):
        task=self.run_report(dict(test_app.GOOD,status='blocked'),lambda p:(p/'result.txt').write_text('File'))
        (self.work/'followup.txt').write_text('New validation evidence')
        raw=json.dumps(dict(test_app.GOOD,status='blocked',artifacts=['result.txt']))
        recovered=self.s.recover_handoff(task['id'],raw,task['session_id'],'Saved CLI report',['followup.txt'])
        self.assertEqual(json.loads(recovered['result']['agent_report'])['artifacts'],['result.txt'])
        self.assertEqual(recovered['result']['recovery_additions'],['followup.txt'])
        self.assertEqual(len([x for x in recovered['output_links'] if x.get('source_path')]),2)


class HandoffPresentationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'Node is needed for UI checks')
    def test_specific_fixes_and_full_report_are_escaped_and_visible(self):
        source=Path(__file__).resolve().parents[1]/'static/task-feedback.js'
        script=r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener(){}},setInterval(){},planModal(){},esc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),stateName:x=>x,date:x=>x};
vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
const t={state:'blocked',config:{mode:'codex'},output_links:[{name:'file',source_path:'good.txt'}],handoff_issues:['missing.txt: restore the file <script>'],result:{summary:'Changes: Useful work\nChecks: 40 tests passed',artifacts:['good.txt'],decisions:[],next_steps:[]}};
const html=c.resultHandoffHTML(t);assert.ok(html.includes('Limitations'));assert.ok(html.includes('missing.txt'));assert.ok(html.includes('40 tests passed'));assert.ok(!html.includes('<script>'));
assert.ok(c.taskFeedbackHTML(t).includes('Report preserved'));
'''
        subprocess.run(['node','-e',script,str(source)],check=True,capture_output=True,text=True)
