"""Large valid tool records are accepted without losing bounded/fatal semantics."""
import json
import unittest
import test_app
from cos.adapter import MAX_EVENT_BYTES


class EventStreamTests(unittest.TestCase):
    setUp = test_app.AdapterTests.setUp
    execute = test_app.AdapterTests.execute

    def tool_event(self,text):
        return {'type':'item.completed','item':{'type':'mcp_tool_call','status':'completed',
                    'result':{'content':[{'type':'text','text':text}]}}}

    def test_large_valid_tool_record_does_not_kill_the_worker(self):
        result,updates,_=self.execute([self.tool_event('Browser documentation. '*15000)]+test_app.fixture_events())
        self.assertEqual(result['status'],'completed')
        self.assertEqual(result['session_id'],test_app.SID)
        self.assertFalse(any(x.get('event')=='malformed' for x in updates))

    def test_large_tool_result_cannot_mask_a_fatal_cli_error(self):
        result,_,_=self.execute([self.tool_event('Documentation. '*15000),
            {'type':'error','message':'Sandbox permission denied'}]+test_app.fixture_events())
        self.assertEqual(result['status'],'blocked')

    def test_oversized_record_does_not_stop_worker_and_preserves_report(self):
        result,_,_=self.execute([self.tool_event('x'*(MAX_EVENT_BYTES+1))]+test_app.fixture_events())
        self.assertEqual(result['status'],'blocked')
        self.assertEqual(result['summary'],test_app.GOOD['summary'])
        self.assertIn('capture buffer',result['handoff_issues'][0])
        self.assertIn('agent continued running',result['handoff_issues'][0])
        self.assertIn('Synthetic engineering report',result['agent_report'])

    def test_record_budget_counts_utf8_bytes_not_just_characters(self):
        raw=json.dumps(self.tool_event('\U0001f680'*(MAX_EVENT_BYTES//4+1)),ensure_ascii=False)
        self.assertLess(len(raw),MAX_EVENT_BYTES)
        self.assertGreater(len(raw.encode('utf-8')),MAX_EVENT_BYTES)
        result,_,_=self.execute([raw]+test_app.fixture_events())
        self.assertEqual(result['status'],'blocked')
        self.assertIn('capture buffer',result['handoff_issues'][0])

    def test_long_run_has_no_cumulative_output_cutoff(self):
        result,_,_=self.execute([self.tool_event('x'*900000)]*20+test_app.fixture_events())
        self.assertEqual(result['status'],'completed')

    def test_many_small_events_have_no_count_cutoff(self):
        result,_,_=self.execute([{'type':'future.event'}]*20001+test_app.fixture_events())
        self.assertEqual(result['status'],'completed')

    def test_malformed_record_below_budget_is_still_not_trusted(self):
        result,_,_=self.execute(['x'*200000]+test_app.fixture_events())
        self.assertEqual(result['status'],'blocked')
        self.assertIn('malformed',result['handoff_issues'][0])
