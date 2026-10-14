"""Perspective cues and support shadows use the actual sprite geometry."""
import json
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which('node'),'Node needed for live geometry')
class SceneryGeometryTests(unittest.TestCase):
    def geometry(self):
        result=subprocess.run(['node','-e',"console.log(JSON.stringify(require('./static/lunar-base/source/base-layout.js')))"] ,cwd=ROOT,capture_output=True,text=True,check=True)
        return json.loads(result.stdout)

    def test_native_aspect_and_support_contacts(self):
        try:from PIL import Image
        except ImportError:self.skipTest('Pillow needed for sprite contact checks')
        manifest=json.loads((ROOT/'static/lunar-base/source/display-asset-manifest.json').read_text())
        for obj in self.geometry()['objects']:
            with self.subTest(asset=obj['id']):
                if obj.get('src'):
                    image=Image.open(ROOT/'static'/obj['src'].lstrip('/')).convert('RGBA')
                elif obj['asset'] in ('habitat','console'):
                    image=Image.open(ROOT/'static/lunar-base/assets'/(obj['asset']+'.png')).convert('RGBA')
                else:
                    r=manifest['regions'][obj['asset']]
                    image=Image.open(ROOT/'static/lunar-base/assets/astronaut-teal.png').convert('RGBA').crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height']))
                self.assertAlmostEqual(obj['width']/obj['height'],image.width/image.height,places=10)
                sx=image.width/obj['nativeSize'][0];sy=image.height/obj['nativeSize'][1]
                alpha=image.getchannel('A')
                for x,y,rx,ry in obj['contacts']:
                    px,py=round(x*sx),round(y*sy)
                    # The center is the first transparent row at this support.
                    # Its contact patch must touch opaque art within two pixels.
                    self.assertTrue(any(alpha.getpixel((px,yy))>=128 for yy in range(max(0,py-2),min(image.height,py+1))),f"{obj['id']} detached support {x,y}")
                    self.assertGreater(rx,0);self.assertGreater(ry,0)
                self.assertAlmostEqual(obj['groundDepth'],obj['y']+max(c[1] for c in obj['contacts'])*obj['scale'])

    def test_distant_sites_scale_people_with_their_work_area(self):
        base=self.geometry();sites={o['id']:o for o in base['objects']}
        for area in ['garage','rover']:
            self.assertLess(sites[area]['groundDepth'],sites['habitat']['groundDepth'])
            self.assertLess(sites[area]['distanceScale'],1)
            result=subprocess.run(['node','-e',"const m=require('./static/lunar-base/source/live-model.js');console.log(JSON.stringify(Array.from({length:m.WORKERS_PER_PAGE},(_,i)=>m.workerPosition({x:0,y:0},i))))"],cwd=ROOT,capture_output=True,text=True,check=True)
            positions=json.loads(result.stdout)
            for position in [p for p in positions if p['area']==area]:
                self.assertEqual(position['scale'],base['crewScale']*sites[area]['distanceScale'])
