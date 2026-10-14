"""Shared crew clearance checks use all frames of the shipped raster artwork."""
import json
import math
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parent.parent

class SharedCrewTests(unittest.TestCase):
    def fixture(self,*args):
        node=shutil.which('node')
        if not node:self.skipTest('Node unavailable')
        result=subprocess.run([node,str(ROOT/'static/lunar-base/source/test_shared_crew.cjs'),*args],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        return result.stdout

    def test_shared_infrastructure_and_persistent_crew(self):
        self.fixture()

    def test_all_sprite_frames_attention_and_labels_have_clearance(self):
        try:from PIL import Image
        except ImportError:self.skipTest('Pillow required for artwork clearance validation')
        crew=json.loads(self.fixture('--json'))
        bounds=[]
        # Composite atlas coordinates are the exact regions used by live-view.js.
        for colour in ['teal','amber']:
            atlas=Image.open(ROOT/'static/lunar-base/assets'/('astronaut-'+colour+'.png')).convert('RGBA')
            for y,cell,rows,columns in [(1344,64,3,6),(1920,96,5,4),(2880,64,2,4)]:
                for row in range(rows):
                    for col in range(columns):
                        box=atlas.crop((col*cell*3,y+row*192,(col+1)*cell*3,y+(row+1)*192)).getchannel('A').getbbox()
                        self.assertIsNotNone(box)
                        bounds.append((box[0]/3-32,box[1]/3-58,box[2]/3-32,box[3]/3-58))
        # Both facing directions and every work/idle/attention frame, plus padding.
        radius=max(max(abs(box[0]),abs(box[2])) for box in bounds)+2
        top=min(box[1] for box in bounds)-2
        bottom=max(box[3] for box in bounds)+2
        def overlaps(a,b):
            kind_a,aa=a;kind_b,bb=b
            if kind_a==kind_b=='circle':return math.hypot(aa[0]-bb[0],aa[1]-bb[1])<aa[2]+bb[2]
            if kind_a=='circle' or kind_b=='circle':
                circle,rect=(aa,bb) if kind_a=='circle' else (bb,aa)
                x=max(rect[0],min(circle[0],rect[2]));y=max(rect[1],min(circle[1],rect[3]))
                return math.hypot(circle[0]-x,circle[1]-y)<circle[2]
            return aa[0]<bb[2] and aa[2]>bb[0] and aa[1]<bb[3] and aa[3]>bb[1]
        for zoom in [.18,.4,.5,440/768,1.5]:
            shapes={}
            for worker in crew:
                point=worker['position']['work'];x,y=point['x'],point['y'];font=max(7,10*zoom)
                r=max(7,10*zoom)/zoom;half=worker['labelWidth']/2
                shapes[worker['key']]=[('rect',(x-radius,y+top,x+radius,y+bottom)),('circle',(x,y-68,r))]
                if zoom>=.5:shapes[worker['key']].append(('rect',(x-half,y+8,x+half,y+8+(font+4)/zoom)))
            for i,a in enumerate(crew):
                for b in crew[i+1:]:
                    if a['position']['page']!=b['position']['page']:continue
                    for aa in shapes[a['key']]:
                        for bb in shapes[b['key']]:
                            self.assertFalse(overlaps(aa,bb),f"{a['key']}/{b['key']} overlaps at zoom {zoom}")
