"""Lossless extraction and registration of generated turning/waving poses."""
from pathlib import Path
from collections import deque
from PIL import Image
import hashlib,json,shutil
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent.parent)
root=parser.parse_args().root.resolve()
source,assets=root/'source',root/'assets'
original=source/'attention-turn-wave-original.png'
raw=Image.open(original).convert('RGBA');mask=bytearray(a>=128 for a in raw.getchannel('A').tobytes());bodies=[]
for i in range(len(mask)):
    if not mask[i]:continue
    q=deque([i]);mask[i]=0;points=[]
    while q:
        j=q.popleft();y,x=divmod(j,raw.width);points.append((x,y))
        for k in ([j-1] if x else [])+([j+1] if x<raw.width-1 else [])+([j-raw.width] if y else [])+([j+raw.width] if y<raw.height-1 else []):
            if mask[k]:mask[k]=0;q.append(k)
    if len(points)>1000:bodies.append(points)
assert len(bodies)==8,len(bodies)
by_cell={}
for p in bodies:
    xs,ys=zip(*p);bounds=(min(xs),min(ys),max(xs)+1,max(ys)+1)
    idx=int((min(ys)+max(ys))/2/raw.height*2)*4+int((min(xs)+max(xs))/2/raw.width*4)
    by_cell[idx]=(p,bounds)
# Generated left-hand poses are deliberately excluded: retain one consistent hand.
chosen=[0,1,2,5,5,6,5,6];atlas=Image.new('RGBA',(256,128));records=[]
for index,idx in enumerate(chosen):
    points,b=by_cell[idx];frame=raw.crop(b);alpha=Image.new('L',frame.size);a=alpha.load()
    for x,y in points:a[x-b[0],y-b[1]]=255
    frame.putalpha(alpha);head=frame.crop((0,0,frame.width,round(frame.height*.27))).getbbox();axis=(head[0]+head[2])/2
    factor=50/frame.height;frame=frame.resize((round(frame.width*factor),50),Image.Resampling.NEAREST);x=32-round(axis*factor)
    assert 0<=x and x+frame.width<=64
    atlas.alpha_composite(frame,((index%4)*64+x,(index//4)*64+8));records.append({'cell':index,'source_pose':idx,'source_bounds':b,'head_axis':32,'foot_baseline':58,'height':50})
atlas.save(assets/'astronaut-attention-teal.png');amber=atlas.copy();pix=amber.load()
for y in range(amber.height):
    for x in range(amber.width):
        r,g,b,a=pix[x,y]
        if y%64>27 and a and g>r*1.35 and b>r*1.25 and g>60:pix[x,y]=(min(255,int(g*1.3)),min(204,int(g*.83)),max(25,int(r*.6)),a)
amber.save(assets/'astronaut-attention-amber.png')
offset=1216
for colour,poses in [('teal',atlas),('amber',amber)]:
    base=source/('attention-'+colour+'-base.png')
    if not base.exists():shutil.copy2(assets/('astronaut-'+colour+'.png'),base)
    old=Image.open(base).convert('RGBA');texture=Image.new('RGBA',(384,offset+128));texture.alpha_composite(old);texture.alpha_composite(poses,(0,offset))
    assert texture.crop((0,0,old.width,old.height)).tobytes()==old.tobytes()
    texture.save(assets/('astronaut-'+colour+'.png'))
(source/'attention-assets.js').write_text('window.LunarAttentionAssets='+json.dumps({'y':offset,'cell':[64,64],'columns':4,'turnSeconds':1.6,'waveRate':1.5})+';\n')
sheet=Image.new('RGBA',(512,256),'#b1abc6');sheet.alpha_composite(atlas.resize((512,256),Image.Resampling.NEAREST));sheet.convert('RGB').save(source/'attention-frame-contact-sheet.png')
manifest={'generation':'Built-in image_gen; transparent-background eight-pose turn/wave request','original':str(original.name),'processing':'Binary alpha; body-connected extraction; nearest-neighbour scale; head and foot registration; trim-only amber palette; existing texture pixels preserved','selected_source_poses':chosen,'excluded':'Left-hand poses 3,4,7 to prevent switching waving arms','regions':{'turn':[0,offset,256,64],'wave':[0,offset+64,256,64]},'frames':records,'files':{}}
for p in [source/'attention-turn-wave-original.png',source/'attention-teal-base.png',source/'attention-amber-base.png',assets/'astronaut-attention-teal.png',assets/'astronaut-attention-amber.png']:
    manifest['files'][str(p.relative_to(root))]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':list(Image.open(p).size)}
(source/'attention-asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Registered 8 timeline frames from 5 consistent-hand generated poses; prior pixels unchanged.')
