"""Workshop contracts and exact preservation of the original game frames."""
from pathlib import Path
import subprocess
import shutil
import unittest
ROOT=Path(__file__).resolve().parent.parent

class WorkshopTests(unittest.TestCase):
    def test_model_contract(self):
        node=shutil.which('node')
        if not node:self.skipTest('Node unavailable')
        result=subprocess.run([node,str(ROOT/'static/lunar-base/source/test_workshop_model.cjs')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_demo_is_explicit_and_uses_no_api(self):
        demo=(ROOT/'static/lunar-base/source/workshop-demo.js').read_text()
        renderer=(ROOT/'static/lunar-base/source/live-view.js').read_text()
        bundle=(ROOT/'static/lunar-base/scene.js').read_text()
        self.assertNotIn('fetch(',demo)
        self.assertIn("config:{mode:'simulated'}",demo)
        self.assertIn('if(isDemo) {snapshot=root.LunarWorkshop.snapshot(demoElapsed)',renderer)
        self.assertIn("mount({demo:true})",bundle)
        self.assertIn('ILLUSTRATIVE WORKSHOP DEMO',renderer)
        self.assertIn("cos.lunar.workshop-demo.layout.v1",renderer)
        self.assertIn("motion.matches",renderer)
        self.assertIn("document.hidden",renderer)
        self.assertIn('if(isDemo)demoElapsed+=elapsed',renderer)

    def test_atlas_registration_and_original_pixels(self):
        try:from PIL import Image
        except ImportError:self.skipTest('Pillow required only for asset validation/rebuild')
        base=ROOT/'static/lunar-base'
        for colour in ['teal','amber']:
            original=Image.open(base/'source'/('workshop-'+colour+'-base.png')).convert('RGBA').crop((0,0,384,192))
            packed=Image.open(base/'assets'/('astronaut-'+colour+'.png')).convert('RGBA')
            self.assertEqual(packed.crop((0,0,384,192)).tobytes(),original.tobytes())
        atlas=Image.open(base/'assets/astronaut-work-teal.png').convert('RGBA')
        for row in range(5):
            frames=[atlas.crop((col*96,row*64,(col+1)*96,(row+1)*64)) for col in range(4)]
            self.assertGreaterEqual(len({f.tobytes() for f in frames}),3)
            for f in frames:
                self.assertEqual(f.getbbox()[1],8)
                self.assertEqual(f.getbbox()[3],58)
                self.assertEqual(set(f.getchannel('A').getdata()),{0,255})
