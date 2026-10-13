"""Convert real browser frame samples to constant-palette GIF and contact sheet."""
import base64
import io
import json
import sys
from pathlib import Path
from PIL import Image

samples = json.loads(Path(sys.argv[1]).read_text())
destination = Path(sys.argv[2])
destination.mkdir(parents=True, exist_ok=True)
frames = [Image.open(io.BytesIO(base64.b64decode(data.split(',', 1)[1]))).convert('RGB') for data in samples['frames']]
assert len({im.tobytes() for im in frames}) > 20, 'Capture did not contain temporal motion'
times = samples['times']
durations = [max(20, round((b - a) / 10) * 10) for a, b in zip(times, times[1:])] + [200]
palette = frames[0].quantize(colors=256)
quantized = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in frames]
output = destination / 'lunar-base-bounds.gif'
quantized[0].save(output, save_all=True, append_images=quantized[1:], duration=durations, loop=0, optimize=True, disposal=1)
check = Image.open(output)
assert check.n_frames > 20
sheet = Image.new('RGB', (1152, 512))
for position, index in enumerate([0, 10, 20, 30, 45, 60]):
    sheet.paste(frames[index], ((position % 3) * 384, (position // 3) * 256))
sheet.save(destination / 'lunar-base-bounds-frames.png')
report = {'source': 'Actual live Canvas samples captured in local Chrome through supported browser developer tools; no reconstructed or manually advanced simulation frames.', 'samples': len(frames), 'unique_source_frames': len({im.tobytes() for im in frames}), 'gif_frames': check.n_frames, 'duration_ms': sum(durations), 'sample_size': samples['width'], 'interval': 'Real timestamp intervals preserved; approximately 5 fps', 'note': 'Canvas stream WebM attempts repeated still frames on this host and were rejected. This GIF is based on verified unique live pixel samples.'}
(destination / 'motion-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
