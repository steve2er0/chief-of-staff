from pathlib import Path
import shutil,subprocess,unittest
ROOT=Path(__file__).resolve().parent.parent
class PlacementTests(unittest.TestCase):
 def test_layout_and_clearance(self):
  node=shutil.which('node')
  if not node:self.skipTest('Node unavailable')
  r=subprocess.run([node,str(ROOT/'static/lunar-base/source/test_placement_model.cjs')],capture_output=True,text=True)
  self.assertEqual(r.returncode,0,r.stdout+r.stderr)
 def test_isolated_demo_and_navigation(self):
  p=ROOT/'static/lunar-base';s=(p/'source/placement-scene.js').read_text()
  self.assertNotIn('fetch(',s);self.assertNotIn('/api/',s)
  self.assertIn('SYNTHETIC PLACEMENT',s);self.assertIn('prefers-reduced-motion',s);self.assertIn('document.hidden',s)
  self.assertIn('width="1152" height="768"',s)
  self.assertIn('LunarPlacement.mount()',(p/'scene.js').read_text())
  self.assertIn('?mode=placement',(p/'index.html').read_text())
  self.assertIn('/lunar-base/?mode=placement',(ROOT/'static/index.html').read_text())
