"""Compose a contact sheet, common-scale placement and asset-only motion GIF."""
from pathlib import Path
import json,math
from PIL import Image,ImageDraw,ImageFont,ImageChops,ImageOps
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=json.loads((ROOT/'manifest.json').read_text())
SIZE=(1280,800)
LAYOUT={'width':1280,'height':800,'objects':[
 {'id':'habitat','reference':True,'anchor':[290,390]},
 {'id':'communications-dish','anchor':[745,390]},
 {'id':'greenhouse','anchor':[1040,470]},
 {'id':'rover-garage','anchor':[565,630]},
 {'id':'launch-pad','anchor':[1050,775]},
 {'id':'rover','anchor':[630,710]},
 {'id':'astronaut-teal','reference':True,'anchor':[255,439]},
 {'id':'astronaut-amber','reference':True,'anchor':[812,672]}]}
(ROOT/'scene-layout.json').write_text(json.dumps(LAYOUT,indent=2)+'\n')
def font(size):
    for path in ['/System/Library/Fonts/Menlo.ttc','/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']:
        if Path(path).is_file():return ImageFont.truetype(path,size)
    return ImageFont.load_default(size=size)
def rgba(path):return Image.open(ROOT/path).convert('RGBA')
IMAGES={name:rgba(v['display_path']) for name,v in MANIFEST['assets'].items()}
IMAGES.update({name:rgba(v['path']) for name,v in MANIFEST['references'].items()})
BACKGROUND=ImageOps.fit(rgba('references/terrain-reference.png'),SIZE,method=Image.Resampling.LANCZOS,centering=(.5,0)).convert('RGBA')
ATLAS=rgba('sprites-3x/rover-rolling.png');ROVER_CELL=MANIFEST['motion']['rover_rolling_atlas']['cell']
LAYERS={name:rgba('layers/'+name+'-cyan-emission.png') for name in ['greenhouse','communications-dish']}
def geometry(name):
    info=MANIFEST['references'][name] if name in MANIFEST['references'] else MANIFEST['assets'][name]
    return info['logical_size'] if 'logical_size' in info else info['logical_dimensions'],info.get('anchor') or info['ground_anchor']
def motion(t):
    progress=(1-math.cos(2*math.pi*t/8))/2
    x=630-90*progress;y=710+45*progress
    angle=(x-630)/9;frame=round(angle/(2*math.pi/8))%8
    return x,y,frame
def scene(t=0,activity=True):
    image=BACKGROUND.copy();draw=ImageDraw.Draw(image)
    objects=[dict(o) for o in LAYOUT['objects']]
    if activity:
        x,y,frame=motion(t)
        next(o for o in objects if o['id']=='rover')['anchor']=[x,y]
    for obj in sorted(objects,key=lambda o:o['anchor'][1]):
        name=obj['id'];size,anchor=geometry(name);x,y=obj['anchor'];left=round(x-anchor[0]);top=round(y-anchor[1])
        draw.ellipse((x-size[0]*.29,y-4,x+size[0]*.29,y+6),fill=(20,24,46,65))
        sprite=IMAGES[name]
        if name=='rover' and activity:
            w,h=ROVER_CELL;sprite=ATLAS.crop((frame*w,0,(frame+1)*w,h))
        if name in LAYERS and activity:
            # Exact source-pixel layers screen-blended at restrained intensity.
            pulse=.07+.07*math.sin(4*math.pi*t/8+(0 if name=='greenhouse' else math.pi/2))
            layer=LAYERS[name];screen=ImageChops.screen(sprite.convert('RGB'),layer.convert('RGB')).convert('RGBA');screen.putalpha(layer.getchannel('A').point(lambda a:round(a*pulse)))
            sprite=sprite.copy();sprite.alpha_composite(screen)
        sprite=sprite.resize((round(size[0]),round(size[1])),Image.Resampling.LANCZOS)
        image.alpha_composite(sprite,(left,top))
    return image.convert('RGB')
def contact():
    image=Image.new('RGB',(1440,960),'#0b1321');d=ImageDraw.Draw(image)
    d.text((48,30),'LUNAR BASE / EXPANSION 01',font=font(31),fill='#eee8dc');d.text((48,76),'Five future assets  /  ivory + slate  /  amber + cyan',font=font(17),fill='#aabccb')
    names=['rover-garage','greenhouse','communications-dish','launch-pad','rover','reference']
    labels={'rover-garage':'01 / ROVER GARAGE','greenhouse':'02 / GREENHOUSE','communications-dish':'03 / COMMUNICATIONS','launch-pad':'04 / LAUNCH PAD','rover':'05 / UTILITY ROVER','reference':'R / EXISTING BASE SCALE'}
    for i,name in enumerate(names):
        x=48+(i%3)*456;y=125+(i//3)*365;d.rounded_rectangle((x,y,x+432,y+340),radius=15,fill='#162337',outline='#2d3e51')
        d.text((x+20,y+17),labels[name],font=font(17),fill='#ffd18b')
        if name=='reference':
            im=IMAGES['habitat'];size,_=geometry('habitat');w=round(size[0]*.90);h=round(size[1]*.90);im=im.resize((w,h),Image.Resampling.LANCZOS);image.paste(im,(x+26,y+63),im)
            crew=IMAGES['astronaut-teal'].resize((58,58),Image.Resampling.LANCZOS);image.paste(crew,(x+46,y+236),crew);sub='Habitat 410 wide · crew 50 tall'
        else:
            info=MANIFEST['assets'][name];size=info['logical_dimensions'];im=IMAGES[name].resize((round(size[0]*.90),round(size[1]*.90)),Image.Resampling.LANCZOS)
            image.paste(im,(x+(432-im.width)//2,y+58+(230-im.height)//2),im);sub=f"{size[0]}×{size[1]} logical · 3× included"
        d.text((x+20,y+300),sub,font=font(14),fill='#a9bdcc')
    colours=['#f0e6d3','#8f8da8','#23415d','#ffb431','#ffdc9f','#39c4da']
    for i,c in enumerate(colours):d.rounded_rectangle((48+i*39,889,76+i*39,914),radius=4,fill=c)
    d.text((316,889),'All sprites share one scale; no characters baked into new assets.',font=font(15),fill='#b7c6d2')
    d.text((48,931),'FUTURE ASSET PACK · no MVP integration · transparent individual PNG sprites',font=font(14),fill='#6f8a9e')
    image.save(ROOT/'previews/lunar-base-expansion-contact-sheet.png')
def placement():
    image=Image.new('RGB',(1440,1000),'#0b1321');d=ImageDraw.Draw(image)
    d.text((80,28),'LUNAR BASE / THE NEXT INFRASTRUCTURE',font=font(30),fill='#efe8dd');d.text((80,76),'Placement study · all five new assets with existing habitat and 50px crew for scale',font=font(16),fill='#a7bece')
    image.paste(scene(0,False),(80,116));d.rounded_rectangle((79,115,1360,917),radius=4,outline='#3d4d66',width=1)
    d.text((80,942),'GARAGE · GREENHOUSE · COMMUNICATIONS DISH · EMPTY LAUNCH PAD · ROVER',font=font(17),fill='#ffce85');d.text((80,974),'Separate reusable art; no project mapping, live telemetry or agent activity.',font=font(14),fill='#8ca9bc')
    image.save(ROOT/'previews/lunar-base-expansion-placement.png')
def animation():
    samples=[scene(i/8,True).resize((960,600),Image.Resampling.LANCZOS) for i in range(64)]
    sheet=Image.new('RGB',(960*4,600))
    for i,n in enumerate([0,16,32,48]):sheet.paste(samples[n],(i*960,0))
    palette=sheet.quantize(colors=256);frames=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in samples]
    # GIF delays use centiseconds: alternate 120/130 ms for exactly 8 seconds.
    frames[0].save(ROOT/'previews/lunar-base-expansion-motion.gif',save_all=True,append_images=frames[1:],duration=[120 if i%2==0 else 130 for i in range(64)],loop=0,optimize=True,disposal=1)
    (ROOT/'previews/motion-info.json').write_text(json.dumps({'source':'Deterministic asset-only composition, same path/timing as standalone Canvas preview','frames':64,'duration_seconds':8,'dimensions':[960,600],'motion':'Grounded forward/reverse rover with 8 wheel states, gentle cyan greenhouse/dish display pulse','boundary':'Not a recording of app or real agent activity'},indent=2)+'\n')
    strip=Image.new('RGB',(1280,240),'#0b1321');d=ImageDraw.Draw(strip);d.text((18,12),'ROVER / REGISTERED ROLLING STATES',font=font(17),fill='#f8cc85')
    for i in range(8):
        w,h=ROVER_CELL;im=ATLAS.crop((i*w,0,(i+1)*w,h)).resize((151,101),Image.Resampling.NEAREST);strip.paste(im,(i*160,62),im);d.text((i*160+12,184),f'{i} / fixed anchor',font=font(11),fill='#a4b8c8')
    strip.save(ROOT/'previews/rover-frame-contact.png')
if __name__=='__main__':
    contact();placement();animation()
    scene(0,False).resize((960,600),Image.Resampling.LANCZOS).save(ROOT/'previews/lunar-base-expansion-motion-still.jpg',quality=94,subsampling=0)
    print('Rendered contact sheet, common-scale placement and 8-second asset motion preview.')
