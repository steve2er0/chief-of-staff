"""Register generated work poses and pack new art into existing private textures.

Deterministic alpha cleanup, nearest-neighbour resizing and atlas packing only.
Generated originals and original 18-pose atlas are retained unchanged.
"""
from pathlib import Path
import argparse
import hashlib
import json
from collections import deque
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent.parent)
root=parser.parse_args().root.resolve()
source,assets=root/'source',root/'assets'
assets.mkdir(parents=True,exist_ok=True)

def core(im):
    im=im.convert('RGBA')
    im.putalpha(im.getchannel('A').point(lambda a:255 if a>=128 else 0))
    return im

prepared={}
for name,width in [('lander',245),('hologram',235),('teststand',285)]:
    im=core(Image.open(source/('workshop-'+name+'-original.png')))
    im=im.crop(im.getbbox())
    factor=min(width/im.width,245/im.height)
    im=im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.NEAREST)
    im.save(assets/(name+'.png'));prepared[name]=im

raw=Image.open(source/'workshop-actions-original.png').convert('RGBA')
mask=bytearray(1 if a>=128 else 0 for a in raw.getchannel('A').tobytes());components=[]
for i in range(raw.width*raw.height):
    if not mask[i]:continue
    todo=deque([i]);mask[i]=0;points=[]
    while todo:
        j=todo.popleft();y,x=divmod(j,raw.width);points.append((x,y))
        neighbours=([j-1] if x else [])+([j+1] if x<raw.width-1 else [])+([j-raw.width] if y else [])+([j+raw.width] if y<raw.height-1 else [])
        for k in neighbours:
            if mask[k]:mask[k]=0;todo.append(k)
    xs,ys=zip(*points)
    components.append({'points':points,'bounds':(min(xs),min(ys),max(xs)+1,max(ys)+1)})
bodies=sorted(components,key=lambda c:len(c['points']),reverse=True)[:20]
by_cell={}
for body in bodies:
    left,top,right,bottom=body['bounds'];col=int((left+right)/2/raw.width*4);row=int((top+bottom)/2/raw.height*5)
    assert (row,col) not in by_cell
    by_cell[row,col]=body
assert len(by_cell)==20
body_ids={id(c) for c in bodies}
work=Image.new('RGBA',(384,320));records=[]
for row in range(5):
    for col in range(4):
        body=by_cell[row,col];left,top,right,bottom=body['bounds'];points=list(body['points'])
        # Component extraction avoids tiny boot fragments from the previous
        # nominal grid row, which would shrink the scanning poses.
        for extra in components:
            if id(extra) in body_ids:continue
            a,b,c,d=extra['bounds'];cx,cy=(a+c)/2,(b+d)/2
            nearest=min(bodies,key=lambda v:((v['bounds'][0]+v['bounds'][2])/2-cx)**2+((v['bounds'][1]+v['bounds'][3])/2-cy)**2)
            if nearest is body and top<=cy<=bottom and left-8<=cx<=right+90:points.extend(extra['points'])
        box=(min(x for x,y in points),top,max(x for x,y in points)+1,bottom)
        frame=raw.crop(box);alpha=Image.new('L',frame.size);ap=alpha.load()
        for x,y in points:
            if top<=y<bottom:ap[x-box[0],y-top]=255
        frame.putalpha(alpha)
        head=frame.crop((0,0,frame.width,round((bottom-top)*.28))).getbbox()
        center=(head[0]+head[2])/2
        factor=50/(bottom-top)
        size=(round(frame.width*factor),50)
        frame=frame.resize(size,Image.Resampling.NEAREST)
        x=32-round(center*factor)
        assert x>=0 and x+frame.width<=96,(row,col,x,size)
        work.alpha_composite(frame,(col*96+x,row*64+8))
        records.append({'row':row,'column':col,'source_bounds':box,'body_bounds':body['bounds'],'head_axis':32,'foot_baseline':58,'height':50})
work.save(assets/'astronaut-work-teal.png')
amber=work.copy();pixels=amber.load()
for y in range(amber.height):
    for x in range(amber.width):
        r,g,b,a=pixels[x,y]
        if x%96<39 and y%64>27 and a and g>r*1.35 and b>r*1.25 and g>60:
            pixels[x,y]=(min(255,int(g*1.3)),min(204,int(g*.83)),max(25,int(r*.6)),a)
amber.save(assets/'astronaut-work-amber.png')

regions={'work':{'x':0,'y':192,'width':384,'height':320,'columns':4,'rows':['assemble','scan','weld','sensor','inspect'],'cell':[96,64],'foot_anchor':[32,58]}}
y=512
for name,im in prepared.items():regions[name]={'x':0,'y':y,'width':im.width,'height':im.height};y+=im.height+8
for colour,poses in [('teal',work),('amber',amber)]:
    old=Image.open(source/('workshop-'+colour+'-base.png')).convert('RGBA').crop((0,0,384,192))
    texture=Image.new('RGBA',(384,y if colour=='teal' else 512));texture.alpha_composite(old,(0,0));texture.alpha_composite(poses,(0,192))
    if colour=='teal':
        for name,im in prepared.items():texture.alpha_composite(im,(0,regions[name]['y']))
    assert texture.crop((0,0,384,192)).tobytes()==old.tobytes()
    texture.save(assets/('astronaut-'+colour+'.png'))

layout={'regions':regions}
(source/'workshop-assets.js').write_text('window.LunarWorkshopAssets='+json.dumps(layout,separators=(',',':'))+';\n')
manifest={'generation':'Built-in image_gen','processing':'Binary alpha edges; nearest-neighbour resize; helmet/boot registration; restrained amber trim palette; lossless atlas packing','regions':regions,'frames':records,'files':{}}
for p in sorted([*source.glob('workshop-*-original.png'),*source.glob('workshop-*-base.png'),*assets.glob('*.png')]):
    im=Image.open(p)
    manifest['files'][str(p.relative_to(root))]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'size':list(im.size)}
(source/'workshop-asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
sheet=Image.new('RGB',(768,640),'#b1abc6')
for row in range(5):
    for col in range(4):
        frame=work.crop((col*96,row*64,(col+1)*96,(row+1)*64)).resize((192,128),Image.Resampling.NEAREST)
        sheet.paste(frame,(col*192,row*128),frame)
sheet.save(source/'workshop-frame-contact-sheet.png')
print(json.dumps({'registered_work_frames':20,'regions':regions,'original_atlas_pixels':'unchanged'}))
