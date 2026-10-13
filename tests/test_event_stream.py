"""Large valid tool records are accepted without losing bounded/fatal semantics."""
import json
import unittest
from unittest.mock import patch

import test_app


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

    def test_single_record_budget_remains_enforced_and_explained(self):
        result,_,_=self.execute([self.tool_event('x'*(1024*1024+1))]+test_app.fixture_events())
        self.assertEqual(result['status'],'failed')
        self.assertIn('stdout event exceeded',result['summary'])
        self.assertIn('1048576-byte record limit',result['summary'])
        self.assertIn('Partial project files remain on disk',result['summary'])

    def test_record_budget_counts_utf8_bytes_not_just_characters(self):
        raw=json.dumps(self.tool_event('\U0001f680'*300000),ensure_ascii=False)
        self.assertLess(len(raw),1024*1024)
        self.assertGreater(len(raw.encode('utf-8')),1024*1024)
        result,_,_=self.execute([raw]+test_app.fixture_events())
        self.assertEqual(result['status'],'failed')
        self.assertIn('record limit',result['summary'])

    def test_total_budget_and_record_budget_have_distinct_failures(self):
        with patch('cos.adapter.MAX_STREAM_BYTES',200000):
            result,_,_=self.execute([self.tool_event('x'*120000),self.tool_event('y'*120000)]+test_app.fixture_events())
        self.assertEqual(result['status'],'failed')
        self.assertIn('total event output exceeded',result['summary'])
        self.assertIn('200000-byte run limit',result['summary'])

    def test_malformed_record_below_budget_is_still_not_trusted(self):
        result,_,_=self.execute(['x'*200000]+test_app.fixture_events())
        self.assertEqual(result['status'],'failed')
        self.assertIn('malformed',result['summary'])
