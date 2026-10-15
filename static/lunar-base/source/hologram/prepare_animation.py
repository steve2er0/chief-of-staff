"""Register imagegen keyframes and pack a fixed-platform ambient hologram loop.

Artwork comes from the original rocket master and the imagegen capsule edit.
Only the central projection is replaced. No station art or crew atlases are rebuilt.
Pillow is a build/preview dependency only; the app loads one ready-made PNG.
"""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageDraw
from orbit_motion import compose

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
BASE = SOURCE.parent
WIDTH, HEIGHT, COLUMNS = 675, 735, 5
STEPS = 15
PERIOD = 24


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def registered(image, bounds):
    image = image.convert('RGBA')
    image.putalpha(image.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    frame = image.crop(bounds).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    return Image.alpha_composite(Image.new('RGBA', frame.size), frame)


def build():
    original = SOURCE / 'workshop-hologram-original.png'
    capsule_path = HERE / 'capsule-original.png'
    master = Image.open(original).convert('RGBA')
    bounds = master.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
    edited = Image.open(capsule_path).convert('RGBA')
    assert edited.size == master.size, 'The capsule edit must preserve the master canvas'
    # Use the existing packed rocket verbatim, including its antialiased alpha.
    region = json.loads((SOURCE / 'display-asset-manifest.json').read_text())['regions']['hologram']
    with Image.open(BASE / 'assets/astronaut-teal.png') as atlas:
        rocket = atlas.convert('RGBA').crop((region['x'], region['y'], region['x'] + WIDTH, region['y'] + HEIGHT))
    assert registered(master, bounds).tobytes() == rocket.tobytes()
    alternate = registered(edited, bounds)
    sx, sy = WIDTH / (bounds[2] - bounds[0]), HEIGHT / (bounds[3] - bounds[1])
    # Source-space projection volume, clear of all four physical projector posts.
    # Orbital rings/panels outside this volume retain the original artwork.
    mask = Image.new('L', (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(mask)
    for left, top, right, bottom in [(500, 30, 850, 580), (535, 580, 825, 700)]:
        draw.rectangle((round((left-bounds[0])*sx), max(0, round((top-bounds[1])*sy)),
                        round((right-bounds[0])*sx)-1, round((bottom-bounds[1])*sy)-1), fill=255)
    capsule = Image.composite(alternate, rocket, mask)
    frames = []
    for index in range(STEPS+1):
        if index == 0:
            frame = rocket.copy()
        elif index == STEPS:
            frame = capsule.copy()
        else:
            progress = index / STEPS
            ramp = Image.new('L', (WIDTH, HEIGHT)); pixels = ramp.load()
            for y in range(HEIGHT):
                # A broad scan front with no bright flash or blank silhouette.
                edge = max(0, min(1, (progress*1.36-y/455) / .36))
                edge = edge*edge*(3-2*edge)
                for x in range(WIDTH):
                    pixels[x,y] = round(255*edge) if mask.getpixel((x,y)) else 0
            frame = Image.composite(capsule, rocket, ramp)
        frames.append(frame)
    # Two very faint hold variants add a restrained shimmer only to projection pixels.
    for frame in (rocket, capsule):
        subdued = frame.copy(); data = subdued.load()
        for y in range(HEIGHT):
            for x in range(WIDTH):
                if mask.getpixel((x,y)):
                    r,g,b,a = data[x,y]; data[x,y] = (r,g,b,round(a*.985))
        frames.append(subdued)
    packed = Image.new('RGBA', (COLUMNS*WIDTH, math.ceil(len(frames)/COLUMNS)*HEIGHT))
    records = []
    for index, frame in enumerate(frames):
        x,y = index%COLUMNS*WIDTH,index//COLUMNS*HEIGHT
        packed.alpha_composite(frame,(x,y))
        records.append({'index':index,'rect':[x,y,WIDTH,HEIGHT]})
    atlas_path = BASE/'assets/hologram-cycle.png'; packed.save(atlas_path,optimize=True)
    rocket.save(HERE/'rocket-registered.png');capsule.save(HERE/'capsule-registered.png');mask.save(HERE/'projection-mask.png')
    rings = json.loads((HERE/'orbits.json').read_text())
    manifest = {'version':2,'generation':'Built-in imagegen capsule edit; original rocket and fixed platform retained',
                'ambient_only':True,'logical_size':[225,245],'sprite_scale':3,'anchor':[112.5,245],
                'period_seconds':PERIOD,'hold_seconds':9,'transition_seconds':3,
                'source_bounds':list(bounds),'projection_bounds':list(mask.getbbox()),
                'sources':{'rocket':{'path':'../workshop-hologram-original.png','sha256':sha(original)},
                           'capsule':{'path':'capsule-original.png','sha256':sha(capsule_path)}},
                'atlas':{'path':'../../assets/hologram-cycle.png','sha256':sha(atlas_path),'size':list(packed.size),'columns':COLUMNS},
                'frame_size':[WIDTH,HEIGHT],'rocket_frame':0,'capsule_frame':STEPS,'hold_shimmer_frames':[16,17],'frames':records,
                'rings':rings,'ring_geometry':{'path':'orbits.json','sha256':sha(HERE/'orbits.json')}}
    (HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    runtime={'url':'/lunar-base/assets/hologram-cycle.png','width':WIDTH,'height':HEIGHT,'columns':COLUMNS,'steps':STEPS,'period':PERIOD,'hold':9,'transition':3,'rings':rings}
    (SOURCE/'hologram-assets.js').write_text('window.LunarHologramAssets='+json.dumps(runtime,separators=(',',':'))+';\n')
    preview(frames,rings)
    print('Packed 18 fixed-anchor hologram frames; projector pixels remain unchanged.')


def frame_at(seconds):
    t=seconds%PERIOD
    if t<9:return 16 if 2<=t%4<4 else 0
    if t<12:return round((t-9)/3*STEPS)
    if t<21:return 17 if 2<=(t-12)%4<4 else STEPS
    return round((1-(t-21)/3)*STEPS)


def preview(frames,rings):
    background=(11,18,32,255); previews=[]
    for step in range(PERIOD*5):
        frame=compose(frames[frame_at(step/5)],step/5,rings).resize((338,368),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(400,430),background);canvas.alpha_composite(frame,(31,28))
        previews.append(canvas.convert('RGB'))
    previews[0].save(HERE/'hologram-loop.gif',save_all=True,append_images=previews[1:],duration=200,loop=0,optimize=False,disposal=2)
    sheet=Image.new('RGB',(1440,480),background[:3]);draw=ImageDraw.Draw(sheet)
    for column,(seconds,label) in enumerate([(0,'ROCKET - 0s'),(3,'OPPOSED RING SWEEPS - 3s'),(12,'CREW CAPSULE - 12s'),(23,'RETURN SCAN - 23s')]):
        image=compose(frames[frame_at(seconds)],seconds,rings).resize((324,353),Image.Resampling.LANCZOS)
        sheet.paste(image,(column*360+18,52),image)
        draw.text((column*360+18,22),label,fill='#c6dce8')
    draw.text((18,438),'24s ambient loop | counter-rotating projected markings | fixed hardware and anchor | pause + reduced motion',fill='#96abba')
    sheet.save(HERE/'contact-sheet.png')


if __name__=='__main__':
    build()
