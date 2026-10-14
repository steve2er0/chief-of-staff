"""Prepare isolated Lunar Base expansion sprites; never touches MVP assets.

Pillow is the only preparation dependency. Full generated masters are retained
on the Mac. Compact distributions can reuse the already prepared 3x exports.
"""
from pathlib import Path
import argparse,hashlib,json,math,shutil
from PIL import Image,ImageChops,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
SCALE=3;PAD=8
SPECS={'rover-garage':340,'greenhouse':300,'communications-dish':150,'launch-pad':330,'rover':135}
ORIGINALS={'rover-garage':'exec-d3fd551d-8a68-4609-a9ec-929ced7ae938.png','greenhouse':'exec-56a3b535-f6e5-4f58-94c3-6d1dd912afbe.png','communications-dish':'exec-d531c4b2-0c45-4b2a-8d8e-5423a5aeed3d.png','launch-pad':'exec-fd07cbe0-ce67-45f7-b3a1-8c11a899b56e.png','rover':'exec-e6947bc9-d273-4c94-be3c-4c28dbe18a8a.png'}

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def rgba(path):return Image.open(path).convert('RGBA')
def initialize(repo,generated):
    source=ROOT/'source';masters=source/'masters';masters.mkdir(parents=True,exist_ok=True)
    for name,file in ORIGINALS.items():
        target=masters/(name+'.png')
        if not target.exists():shutil.copy2(generated/file,target)
    refs=ROOT/'references';refs.mkdir(exist_ok=True)
    base=repo/'static/lunar-base'
    for name,path in [('habitat-reference.png','assets/habitat.png'),('terrain-reference.png','assets/terrain.png')]:
        target=refs/name
        if not target.exists():shutil.copy2(base/path,target)
    display=json.loads((base/'source/display-asset-manifest.json').read_text())
    for colour in ['teal','amber']:
        image=rgba(base/'assets'/('astronaut-'+colour+'.png'));y=display['regions']['crew']['y']+192
        image.crop((0,y,192,y+192)).save(refs/('astronaut-'+colour+'-reference.png'))
    # This is provenance, not a duplicate Library item or a changed art board.
    shutil.copy2(base/'source/reference/identity.json',refs/'approved-board-identity.json')
    (source/'source-references.json').write_text(json.dumps({'approved_board':json.loads((refs/'approved-board-identity.json').read_text()),'unchanged_input_hashes':{str(p.relative_to(base)):digest(p) for p in [base/'assets/habitat.png',base/'assets/terrain.png',base/'assets/astronaut-teal.png',base/'assets/astronaut-amber.png']}},indent=2)+'\n')

def prepare():
    for name in ['sprites','sprites-3x','layers','previews']:(ROOT/name).mkdir(exist_ok=True)
    manifest={'version':1,'purpose':'Future expansion assets only; no MVP/app integration','display_scale':3,'anchor_units':'logical pixels; bottom-centre ground baseline','generation':'Built-in image_gen, one call per asset; unchanged generated masters','processing':'Binary alpha core at 128, alpha-bounds crop, common logical sizing, 3x Lanczos display export and nearest-neighbour logical export; no repainting','assets':{},'references':{'habitat':{'path':'references/habitat-reference.png','logical_size':[410,764/3],'anchor':[205,764/3]},'astronaut-teal':{'path':'references/astronaut-teal-reference.png','logical_size':[64,64],'anchor':[32,58]},'astronaut-amber':{'path':'references/astronaut-amber-reference.png','logical_size':[64,64],'anchor':[32,58]}}}
    for name,width in SPECS.items():
        master=ROOT/'source/masters'/(name+'.png')
        if master.exists():
            original=rgba(master);core=original.copy();core.putalpha(original.getchannel('A').point(lambda a:255 if a>=128 else 0));bounds=core.getbbox();body=core.crop(bounds)
            height=round(width*body.height/body.width);size=(width+PAD*2,height+PAD*2)
            display=Image.new('RGBA',(size[0]*3,size[1]*3));display.alpha_composite(body.resize((width*3,height*3),Image.Resampling.LANCZOS),(PAD*3,PAD*3))
            logical=Image.new('RGBA',size);logical.alpha_composite(body.resize((width,height),Image.Resampling.NEAREST),(PAD,PAD))
            display.save(ROOT/'sprites-3x'/(name+'.png'));logical.save(ROOT/'sprites'/(name+'.png'))
            original_info={'original_file':ORIGINALS[name],'master':'source/masters/'+name+'.png','master_dimensions':list(original.size),'master_sha256':digest(master),'core_source_bounds':list(bounds)}
        else:
            display=rgba(ROOT/'sprites-3x'/(name+'.png'));size=(display.width//3,display.height//3);logical=display.resize(size,Image.Resampling.NEAREST);logical.save(ROOT/'sprites'/(name+'.png'))
            old=json.loads((ROOT/'manifest.json').read_text())['assets'][name];original_info=old['source']
        anchor=[round(size[0]/2),size[1]-PAD]
        manifest['assets'][name]={'path':'sprites/'+name+'.png','display_path':'sprites-3x/'+name+'.png','logical_dimensions':list(size),'display_dimensions':list(display.size),'ground_anchor':anchor,'display_anchor':[v*3 for v in anchor],'logical_alpha_bounds':list(logical.getbbox()),'opaque_ground_shadow':False,'sha256':digest(ROOT/'sprites'/(name+'.png')),'display_sha256':digest(ROOT/'sprites-3x'/(name+'.png')),'source':original_info}
    # Mechanical layers extracted from the rover bitmap. The hull, silhouettes,
    # lighting and registration remain fixed; only wheel interiors rotate.
    rover=rgba(ROOT/'sprites-3x/rover.png');wheels=[]
    for label,x,y,rx,ry in [('front',73,81,9,10),('middle',105,70,8,9),('rear',132,61,7,8)]:
        box=(int((x-rx)*3),int((y-ry)*3),int((x+rx)*3),int((y+ry)*3));layer=rover.crop(box);mask=Image.new('L',layer.size);ImageDraw.Draw(mask).ellipse((0,0,layer.width-1,layer.height-1),fill=255)
        layer.putalpha(ImageChops.multiply(layer.getchannel('A'),mask));layer.save(ROOT/'layers'/('rover-wheel-'+label+'.png'));wheels.append({'path':'layers/rover-wheel-'+label+'.png','display_box':list(box),'logical_center':[x,y],'logical_radii':[rx,ry]})
    rover_frames=[]
    for i in range(8):
        frame=rover.copy()
        for wheel in wheels:
            layer=rgba(ROOT/wheel['path']);mask=layer.getchannel('A');circle=layer.resize((layer.height,layer.height),Image.Resampling.LANCZOS);rotated=circle.rotate(-45*i,resample=Image.Resampling.NEAREST).resize(layer.size,Image.Resampling.LANCZOS);rotated.putalpha(mask);frame.alpha_composite(rotated,tuple(wheel['display_box'][:2]))
        frame.putalpha(rover.getchannel('A'));rover_frames.append(frame)
    atlas=Image.new('RGBA',(rover.width*8,rover.height))
    for i,frame in enumerate(rover_frames):atlas.alpha_composite(frame,(rover.width*i,0))
    atlas.save(ROOT/'sprites-3x/rover-rolling.png')
    for name in ['greenhouse','communications-dish']:
        original=rgba(ROOT/'sprites-3x'/(name+'.png'));overlay=original.copy();pixels=overlay.load()
        for y in range(overlay.height):
            for x in range(overlay.width):
                r,g,b,a=pixels[x,y]
                pixels[x,y]=(r,g,b,a if r<110 and g>r*1.4 and b>145 and g>105 else 0)
        overlay.save(ROOT/'layers'/(name+'-cyan-emission.png'))
    manifest['motion']={'purpose':'Standalone asset study only; synthetic visual loop, no telemetry','loop_seconds':8,'rover_path':[[630,710],[540,755]],'rover_rolling_atlas':{'path':'sprites-3x/rover-rolling.png','cell':list(rover.size),'columns':8,'anchor':manifest['assets']['rover']['display_anchor'],'wheel_radius_logical':9},'wheels':wheels,'cyan_emission_layers':['layers/greenhouse-cyan-emission.png','layers/communications-dish-cyan-emission.png'],'activity':'Gentle forward/reverse shuttle with wheel rotation tied to displacement; restrained cyan display/greenhouse pulses. Pause/reduced motion holds a static frame.'}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Prepared 5 transparent sprites at logical and 3x sizes, 8 registered rover wheel states and 2 emission layers.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path);parser.add_argument('--generated',type=Path);args=parser.parse_args()
    if args.repo and args.generated:initialize(args.repo,args.generated)
    prepare()
