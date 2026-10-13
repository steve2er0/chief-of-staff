"""Deterministic atlas extraction, anchor registration and palette variant.

Requires Pillow only for rebuilding; browser and app have no dependencies.
The approved reference is never edited. Generated originals remain unchanged.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE, ASSETS = ROOT / 'source', ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)

def core(image):
    image = image.convert('RGBA')
    alpha = image.getchannel('A')
    image.putalpha(alpha.point(lambda value: 255 if value >= 128 else 0))
    return image

for name, width in [('habitat', 410), ('console', 86)]:
    image = core(Image.open(SOURCE / (name + '-original.png')))
    image = image.crop(image.getbbox())
    image = image.resize((width, round(width * image.height / image.width)), Image.Resampling.NEAREST)
    image.save(ASSETS / (name + '.png'))

Image.open(SOURCE / 'terrain-original.png').convert('RGB').resize((768, 512), Image.Resampling.NEAREST).save(ASSETS / 'terrain.png')
original = Image.open(SOURCE / 'astronaut-original.png').convert('RGBA')
atlas = Image.new('RGBA', (64 * 6, 64 * 3))
frame_records = []
for row in range(3):
    for col in range(6):
        cell = core(original.crop((col * 256, round(row * 1024 / 3), (col + 1) * 256, round((row + 1) * 1024 / 3))))
        bounds = cell.getbbox()
        frame = cell.crop(bounds)
        # Register the helmet center rather than the swinging arms/legs.
        head_bounds = frame.crop((0, 0, frame.width, min(80, frame.height))).getbbox()
        head_center = (head_bounds[0] + head_bounds[2]) / 2
        factor = 50 / frame.height
        frame = frame.resize((round(frame.width * factor), 50), Image.Resampling.NEAREST)
        x = 32 - round(head_center * factor)
        atlas.alpha_composite(frame, (col * 64 + x, row * 64 + 8))
        frame_records.append({'row': row, 'column': col, 'source_bounds': bounds, 'anchor': [32, 58], 'height': 50})
atlas.save(ASSETS / 'astronaut-teal.png')
amber = atlas.copy()
pixels = amber.load()
for y in range(amber.height):
    for x in range(amber.width):
        r, g, b, a = pixels[x, y]
        # Suit trim only; preserve dark visor/cyan helmet highlights.
        if y % 64 > 27 and a and g > r * 1.35 and b > r * 1.25 and g > 60:
            pixels[x, y] = (min(255, int(g * 1.3)), min(204, int(g * .83)), max(25, int(r * .6)), a)
amber.save(ASSETS / 'astronaut-amber.png')
records = {'atlas': {'cell': [64, 64], 'columns': 6, 'rows': ['walking', 'idle', 'working'], 'foot_anchor': [32, 58]}, 'frames': frame_records, 'files': {}}
for path in sorted(list(SOURCE.glob('*-original.png')) + list(ASSETS.glob('*.png'))):
    records['files'][str(path.relative_to(ROOT))] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size, 'size': list(Image.open(path).size)}
(SOURCE / 'asset-manifest.json').write_text(json.dumps(records, indent=2) + '\n')
preview = Image.new('RGB', (768, 384), '#b1abc6')
for row in range(3):
    for col in range(6):
        frame = atlas.crop((col * 64, row * 64, (col + 1) * 64, (row + 1) * 64)).resize((128, 128), Image.Resampling.NEAREST)
        preview.paste(frame, (col * 128, row * 128), frame)
preview.save(SOURCE / 'frame-contact-sheet.png')
print('Prepared 5 runtime PNGs and 18 registered frames.')
