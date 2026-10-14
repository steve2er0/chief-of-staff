"""Perspective cues and support shadows use the actual sprite geometry."""
import json
import math
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

    def test_work_spots_are_on_open_ground_beside_their_infrastructure(self):
        base=self.geometry();objects={o['id']:o for o in base['objects']}
        for name,station in base['stations'].items():
            with self.subTest(station=name):
                self.assertIn(station['area'],objects,'every work spot serves actual infrastructure')
                x,y=station['work'];own=objects[station['area']]
                gap=math.hypot(max(own['x']-x,0,x-own['x']-own['width']),max(own['y']-y,0,y-own['y']-own['height']))
                self.assertLess(gap,160,'work spot drifted too far from its infrastructure')
                for obj in objects.values():
                    self.assertFalse(obj['x']<x<obj['x']+obj['width'] and obj['y']<y<obj['y']+obj['height'],f"{name} is inside {obj['id']}")

    def test_hub_rest_frames_and_available_markers_have_clearance(self):
        result=subprocess.run(['node','-e',"const b=require('./static/lunar-base/source/base-layout.js'),a=require('./static/lunar-base/source/availability-model.js');console.log(JSON.stringify(a.restSpots(b).slice(0,28)));"],cwd=ROOT,capture_output=True,text=True,check=True)
        points=json.loads(result.stdout);base=self.geometry();scale=base['crewScale']
        manifest=json.loads((ROOT/'static/lunar-base/source/availability/manifest.json').read_text())
        boxes=[frame['bbox'] for frame in manifest['frames']]
        left=min(b[0]/3-32 for b in boxes)*scale;right=max(b[2]/3-32 for b in boxes)*scale
        top=min(b[1]/3-58 for b in boxes)*scale
        self.assertEqual(len(points),28)
        for zoom in [.18,.32,.5,1.5]:
            radius=max(3.5/zoom,5*scale)
            for i,a in enumerate(points):
                for b in points[i+1:]:
                    self.assertFalse(a['x']+left<b['x']+right and a['x']+right>b['x']+left and a['y']+top<b['y'] and a['y']>b['y']+top,'resting sprite envelopes overlap')
                    for badge,body in [(a,b),(b,a)]:
                        x=badge['x']+24*scale;y=badge['y']-24*scale
                        nx=max(body['x']+left,min(x,body['x']+right));ny=max(body['y']+top,min(y,body['y']))
                        self.assertGreaterEqual(math.hypot(x-nx,y-ny),radius,'Available marker covers another resting astronaut')

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
