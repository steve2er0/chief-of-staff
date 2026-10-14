"""Package the existing illustration masters for high-density displays.

No artwork is generated or repainted. Legacy atlas regions are retained verbatim
for development fixtures; the live renderer uses appended 3x registered regions.
Run after the legacy preparation scripts and before build_scene.py. Needs Pillow.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE, ASSETS = ROOT / 'source', ROOT / 'assets'
SCALE = 3


def core(image):
    image = image.convert('RGBA')
    image.putalpha(image.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    return image


def register(frame, cell_width=64, head_fraction=None):
    frame = core(frame)
    head_height = round(frame.height * head_fraction) if head_fraction else min(80, frame.height)
    head = frame.crop((0, 0, frame.width, head_height)).getbbox()
    axis = (head[0] + head[2]) / 2
    factor = 50 * SCALE / frame.height
    frame = frame.resize((round(frame.width * factor), 50 * SCALE), Image.Resampling.LANCZOS)
    x = 32 * SCALE - round(axis * factor)
    assert 0 <= x and x + frame.width <= cell_width * SCALE
    result = Image.new('RGBA', (cell_width * SCALE, 64 * SCALE))
    result.alpha_composite(frame, (x, 8 * SCALE))
    return result


def amber_trim(image, cell_width=64):
    image = image.copy()
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            # Keep the visor and tool glow; vary suit trim only.
            if y % (64 * SCALE) > 27 * SCALE and (cell_width == 64 or x % (96 * SCALE) < 39 * SCALE) and a and g > r * 1.35 and b > r * 1.25 and g > 60:
                pixels[x, y] = (min(255, int(g * 1.3)), min(204, int(g * .83)), max(25, int(r * .6)), a)
    return image


# Full-resolution terrain and registered static props, from unchanged masters.
Image.open(SOURCE / 'terrain-original.png').convert('RGB').save(ASSETS / 'terrain.png')
for name, width in [('habitat', 410), ('console', 86)]:
    im = core(Image.open(SOURCE / (name + '-original.png')))
    im = im.crop(im.getbbox())
    im.resize((width * SCALE, round(width * SCALE * im.height / im.width)), Image.Resampling.LANCZOS).save(ASSETS / (name + '.png'))

walk = Image.new('RGBA', (384 * SCALE, 192 * SCALE))
raw = Image.open(SOURCE / 'astronaut-original.png').convert('RGBA')
frames = json.loads((SOURCE / 'asset-manifest-v1.json').read_text())['frames']
for item in frames:
    row, col = item['row'], item['column']
    cell = raw.crop((col * 256, round(row * 1024 / 3), (col + 1) * 256, round((row + 1) * 1024 / 3)))
    frame = register(cell.crop(item['source_bounds']))
    walk.alpha_composite(frame, (col * 64 * SCALE, row * 64 * SCALE))

work = Image.new('RGBA', (384 * SCALE, 320 * SCALE))
raw = Image.open(SOURCE / 'workshop-actions-original.png').convert('RGBA')
for item in json.loads((SOURCE / 'workshop-asset-manifest.json').read_text())['frames']:
    frame = register(raw.crop(item['source_bounds']), 96, .28)
    work.alpha_composite(frame, (item['column'] * 96 * SCALE, item['row'] * 64 * SCALE))

attention = Image.new('RGBA', (256 * SCALE, 128 * SCALE))
raw = Image.open(SOURCE / 'attention-turn-wave-original.png').convert('RGBA')
for item in json.loads((SOURCE / 'attention-asset-manifest.json').read_text())['frames']:
    frame = register(raw.crop(item['source_bounds']), 64, .27)
    index = item['cell']
    attention.alpha_composite(frame, ((index % 4) * 64 * SCALE, (index // 4) * 64 * SCALE))

regions = {}
y = 1344
for name, im in [('crew', walk), ('work', work), ('attention', attention)]:
    regions[name] = {'x': 0, 'y': y, 'width': im.width, 'height': im.height, 'scale': SCALE}
    y += im.height
crew_end = y
props = {}
for name, width, height in [('lander', 233, 245), ('hologram', 225, 245), ('teststand', 285, 160)]:
    im = core(Image.open(SOURCE / ('workshop-' + name + '-original.png')))
    im = im.crop(im.getbbox()).resize((width * SCALE, height * SCALE), Image.Resampling.LANCZOS)
    props[name] = im
    regions[name] = {'x': 0, 'y': y, 'width': im.width, 'height': im.height, 'scale': SCALE}
    y += im.height + 8

for colour in ['teal', 'amber']:
    # Reconstruct legacy textures from source snapshots, not the prior build.
    old = Image.open(SOURCE / ('attention-' + colour + '-base.png')).convert('RGBA')
    legacy_attention = Image.open(ASSETS / ('astronaut-attention-' + colour + '.png')).convert('RGBA')
    atlas = Image.new('RGBA', (384 * SCALE, y if colour == 'teal' else crew_end))
    atlas.alpha_composite(old)
    atlas.alpha_composite(legacy_attention, (0, 1216))
    for name, im in [('crew', walk), ('work', work), ('attention', attention)]:
        if colour == 'amber':
            im = amber_trim(im, 96 if name == 'work' else 64)
        atlas.alpha_composite(im, (0, regions[name]['y']))
    if colour == 'teal':
        for name, im in props.items():
            atlas.alpha_composite(im, (0, regions[name]['y']))
    atlas.save(ASSETS / ('astronaut-' + colour + '.png'))

(SOURCE / 'display-assets.js').write_text('window.LunarDisplayAssets=' + json.dumps({'regions': regions}, separators=(',', ':')) + ';\n')
paths = [ASSETS / (name + '.png') for name in ['terrain', 'habitat', 'console', 'astronaut-teal', 'astronaut-amber']]
manifest = {'source': 'Existing unchanged image_gen masters', 'sprite_scale': SCALE,
            'logical_cell': [64, 64], 'logical_foot_anchor': [32, 58], 'regions': regions,
            'files': {p.name: {'size': list(Image.open(p).size), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths}}
(SOURCE / 'display-asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Packaged full-resolution terrain, 3x props and 46 registered animation frames.')
