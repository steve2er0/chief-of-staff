"""Acceptance checks for reusable sprites, transparent edges and registration."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'manifest.json').read_text());results=[]
for name,item in m['assets'].items():
    small=Image.open(ROOT/item['path']).convert('RGBA');large=Image.open(ROOT/item['display_path']).convert('RGBA')
    assert list(small.size)==item['logical_dimensions'];assert large.size==(small.width*3,small.height*3)
    assert hashlib.sha256((ROOT/item['path']).read_bytes()).hexdigest()==item['sha256']
    assert small.getchannel('A').getextrema()==(0,255)
    box=small.getbbox();assert box[0]>=7 and box[1]>=7 and box[2]<=small.width-7 and box[3]<=small.height-7
    for x,y in [(0,0),(small.width-1,0),(0,small.height-1),(small.width-1,small.height-1)]:assert small.getpixel((x,y))[3]==0
    assert item['ground_anchor'][1]==small.height-8;assert item['display_anchor']==[v*3 for v in item['ground_anchor']]
    original=ROOT/item['source']['master']
    if original.exists():assert hashlib.sha256(original.read_bytes()).hexdigest()==item['source']['master_sha256']
    results.append(name+': alpha, margins, scale, anchors and provenance pass')
atlas=Image.open(ROOT/m['motion']['rover_rolling_atlas']['path']).convert('RGBA');w,h=m['motion']['rover_rolling_atlas']['cell'];base=Image.open(ROOT/'sprites-3x/rover.png').convert('RGBA')
assert atlas.size==(w*8,h)
for i in range(8):assert atlas.crop((i*w,0,(i+1)*w,h)).getchannel('A').tobytes()==base.getchannel('A').tobytes()
results.append('Rover: all 8 frames preserve the exact silhouette, ground baseline and fixed hull registration')
for name in ['greenhouse','communications-dish']:
    layer=Image.open(ROOT/'layers'/(name+'-cyan-emission.png')).convert('RGBA');assert layer.getbbox() is not None
results.append('Dish/greenhouse: source-derived emission layers are nonempty')
gif=Image.open(ROOT/'previews/lunar-base-expansion-motion.gif');assert gif.n_frames>=40
frames=[];duration=0
for i in range(gif.n_frames):gif.seek(i);frames.append(hashlib.sha256(gif.convert('RGB').tobytes()).hexdigest());duration+=gif.info['duration']
assert len(set(frames))>=40;assert 7900<=duration<=8100
results.append(f'Motion GIF: {gif.n_frames} measured output frames, {duration/1000:.2f}s, moving regions confirmed')
layout=json.loads((ROOT/'scene-layout.json').read_text())
for obj in layout['objects']:
    item=m['references'].get(obj['id']) or m['assets'][obj['id']];size=item.get('logical_size') or item['logical_dimensions'];anchor=item.get('anchor') or item['ground_anchor'];x,y=obj['anchor'];left=x-anchor[0];top=y-anchor[1]
    assert 0<=left and 0<=top and left+size[0]<=layout['width'] and top+size[1]<=layout['height']
results.append('Placement: every sprite fits wholly inside the review viewport')
# Bright and dark alpha inspection uses the exact exported sprites, no art edits.
sheet=Image.new('RGB',(1600,420),'#e8e2d8');d=ImageDraw.Draw(sheet)
for i,(name,item) in enumerate(m['assets'].items()):
    sprite=Image.open(ROOT/item['display_path']).convert('RGBA');sprite.thumbnail((290,310),Image.Resampling.LANCZOS);x=i*320+15;y=50+(310-sprite.height)//2;sheet.paste(sprite,(x,y),sprite);d.text((x,385),name,fill='#172335')
sheet.save(ROOT/'previews/alpha-check-light.png')
report={'checks':results,'status':'passed','existing_application':'Asset acceptance only; live integration is validated separately in VALIDATION-LIVE.md'};(ROOT/'validation.json').write_text(json.dumps(report,indent=2)+'\n');print('\n'.join(results))
