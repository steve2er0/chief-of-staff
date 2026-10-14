"""Private GET-only attention scene with precise state-model checks."""
import json,shutil,subprocess,unittest
from pathlib import Path
from unittest.mock import patch
import test_lunar_base
class AttentionHTTPTests(unittest.TestCase):
    setUp=test_lunar_base.LunarBaseTests.setUp
    tearDown=test_lunar_base.LunarBaseTests.tearDown
    request=test_lunar_base.LunarBaseTests.request
    def test_attention_route_remains_private_and_cannot_start_work(self):
        self.assertEqual(self.request('/lunar-base/?mode=attention',False)[0],401)
        before=list(self.service.store.db.iterdump())
        with patch.object(self.service,'launch',side_effect=AssertionError('launch forbidden')),patch.object(self.service.store,'put',side_effect=AssertionError('GET write forbidden')):
            for _ in range(3):
                self.assertEqual(self.request('/lunar-base/?mode=attention')[0],200)
                self.assertEqual(self.request('/api/state')[0],200)
        self.assertEqual(before,list(self.service.store.db.iterdump()));self.assertFalse(self.service.active)
class AttentionSourceTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'Node unavailable')
    def test_request_semantics_links_motion_and_resolution(self):
        root=Path(__file__).resolve().parents[1]
        r=subprocess.run(['node',str(root/'static/lunar-base/source/test_attention_model.cjs')],capture_output=True,text=True)
        self.assertEqual(r.returncode,0,r.stdout+r.stderr)
    def test_original_assets_preserved_and_attention_registered(self):
        try:from PIL import Image
        except ImportError:self.skipTest("Pillow is only needed for asset pixel verification")
        root=Path(__file__).resolve().parents[1]/'static/lunar-base'
        for colour in ['teal','amber']:
            old=Image.open(root/'source'/('attention-'+colour+'-base.png')).convert('RGBA');new=Image.open(root/'assets'/('astronaut-'+colour+'.png')).convert('RGBA')
            self.assertEqual(old.tobytes(),new.crop((0,0,old.width,old.height)).tobytes())
        manifest=json.loads((root/'source/attention-asset-manifest.json').read_text())
        self.assertEqual(manifest['selected_source_poses'],[0,1,2,5,5,6,5,6]);self.assertEqual({f['foot_baseline'] for f in manifest['frames']},{58})
