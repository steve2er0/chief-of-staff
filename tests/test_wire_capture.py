"""Disk-backed capture preserves wire values without record-sized RAM growth."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import tracemalloc
import unittest

from cos.results import capture_result
from cos.wire import CapturedText, RawJSON, WireRecord, write_json


class WireCaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()

    def test_large_report_streams_to_the_ordinary_download_with_bounded_memory(self):
        folder=self.root/'output';wire=folder/'wire';wire.mkdir(parents=True)
        path=wire/'record.json';block=b'x'*65536
        expected=hashlib.sha256()
        with path.open('wb') as dst:
            dst.write(b'{"text":"')
            for _ in range(256):dst.write(block);expected.update(block)
            dst.write(b'"}')
        tracemalloc.start()
        try:
            with WireRecord(path) as record:
                text=record.root.get('text');self.assertIsInstance(text,CapturedText)
                self.assertLess(len(text),10000)
                retained=wire/'report.txt';text.save(retained)
                result={'status':'completed','summary':str(text),'agent_report':str(text),'agent_report_file':str(retained),'artifacts':[]}
                links,issues,_=capture_result(folder,self.root,result,[],{},False)
                self.assertFalse(issues)
                self.assertIn('agent-report.txt',[link['name'] for link in links])
                sha=hashlib.sha256()
                with (folder/'agent-report.txt').open('rb') as src:
                    for chunk in iter(lambda:src.read(65536),b''):sha.update(chunk)
                self.assertEqual(sha.hexdigest(),expected.hexdigest())
            self.assertLess(tracemalloc.get_traced_memory()[1],4*1024*1024)
        finally:tracemalloc.stop()

    def test_escaped_unicode_and_chunk_boundaries_preserve_exact_text_and_raw_scope(self):
        text=('Plain \\ quote " newline\n omega Ω rocket 🚀 '*3000)
        value={'permission':{'roots':[text]},'text':text}
        for ascii_only in (True,False):
            path=self.root/('escaped.json' if ascii_only else 'unicode.json')
            path.write_text(json.dumps(value,ensure_ascii=ascii_only))
            with WireRecord(path) as record:
                captured=record.root.get('text');captured.save(self.root/'text.txt')
                self.assertEqual((self.root/'text.txt').read_text(),text)
                output=io.StringIO();write_json({'permissions':RawJSON(record.root.get('permission'))},output)
                self.assertEqual(json.loads(output.getvalue())['permissions'],value['permission'])

    def test_large_container_preview_keeps_identity_and_all_original_values_on_disk(self):
        path=self.root/'array.json'
        with path.open('w') as dst:
            dst.write('{"items":['+','.join('"item"' for _ in range(5000))+'],"id":901,"method":"request"}')
        with WireRecord(path) as record:
            preview=record.root.preview([4096])
            self.assertEqual(preview['id'],901);self.assertEqual(preview['method'],'request')
            self.assertLess(len(preview['items']),5000)
            self.assertEqual(len(record.root.get('items')),5000)
            self.assertEqual(sum(1 for _ in record.root.get('items')),5000)

    def test_invalid_large_record_does_not_leave_a_reusable_partial_index(self):
        path=self.root/'invalid.json';path.write_text('{"text":"'+'x'*70000)
        with self.assertRaises(ValueError):WireRecord(path)
        self.assertFalse(path.with_suffix('.sqlite').exists())
        self.assertTrue(path.exists())

    def test_duplicate_control_keys_are_rejected(self):
        path=self.root/'duplicate.json';path.write_text('{"id":1,"id":2}')
        with self.assertRaises(ValueError):WireRecord(path)
