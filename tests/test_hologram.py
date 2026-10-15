"""Fixed-platform artwork, renderer lifecycle and private read-only asset checks."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import unittest

import test_lunar_base

try:
    from PIL import Image, ImageOps, ImageSequence
except ImportError:
    Image = None

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'static/lunar-base'
SOURCE = BASE / 'source/hologram'


class HologramHTTPTests(unittest.TestCase):
    setUp = test_lunar_base.LunarBaseTests.setUp
    tearDown = test_lunar_base.LunarBaseTests.tearDown
    request = test_lunar_base.LunarBaseTests.request

    def test_runtime_atlas_is_private_and_does_not_create_work(self):
        path = '/lunar-base/assets/hologram-cycle.png'
        before = list(self.service.store.db.iterdump())
        self.assertEqual(self.request(path, False)[0], 401)
        status, data, kind = self.request(path)
        self.assertEqual(status, 200)
        self.assertTrue(kind.startswith('image/png'))
        self.assertEqual(data, (BASE / 'assets/hologram-cycle.png').read_bytes())
        for name in ('manifest.json', 'capsule-original.png', 'hologram-loop.gif'):
            self.assertEqual(self.request('/lunar-base/source/hologram/' + name)[0], 404)
        self.assertEqual(list(self.service.store.db.iterdump()), before)
        self.assertEqual(self.service.active, {})


class HologramRendererTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'), 'Node is needed for renderer checks')
    def test_timing_and_actual_renderer_lifecycle(self):
        result = subprocess.run(['node', str(BASE / 'source/test_hologram.cjs')],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_bundle_contains_current_model_assets_and_renderer(self):
        bundle = (BASE / 'scene.js').read_text()
        for name in ('hologram-assets.js', 'hologram-model.js', 'hologram-orbits.js', 'live-view.js'):
            self.assertIn((BASE / 'source' / name).read_text(), bundle)
        source = (BASE / 'source/hologram-model.js').read_text()
        for capability in ('fetch(', 'setInterval(', 'setTimeout(', '/api/', 'worker', 'task'):
            self.assertNotIn(capability, source.split('*/', 1)[1])


@unittest.skipIf(Image is None, 'Pillow is needed for artwork checks')
class HologramArtworkTests(unittest.TestCase):
    def test_rings_move_without_altering_physical_hardware_or_the_morph(self):
        spec = importlib.util.spec_from_file_location('orbit_preview', SOURCE / 'orbit_motion.py')
        orbit = importlib.util.module_from_spec(spec); spec.loader.exec_module(orbit)
        rings = json.loads((SOURCE / 'orbits.json').read_text())
        with Image.open(SOURCE / 'rocket-registered.png') as source:
            rocket = source.convert('RGBA')
        with Image.open(SOURCE / 'capsule-registered.png') as source:
            capsule = source.convert('RGBA')
        for frame in (rocket, capsule):
            first = orbit.compose(frame, 0, rings)
            self.assertNotEqual(first.tobytes(), orbit.compose(frame, 3, rings).tobytes())
            self.assertEqual(first.tobytes(), orbit.compose(frame, 24, rings).tobytes())
            for index in range(rings['frames']):
                pose = orbit.compose(frame, index/5, rings)
                self.assertEqual(pose.crop((0, 400, 675, 735)).tobytes(), frame.crop((0, 400, 675, 735)).tobytes())
                self.assertEqual(pose.crop((0, 0, 118, 735)).tobytes(), frame.crop((0, 0, 118, 735)).tobytes())
        # Both previews and the browser use the same ring paths and layer split.
        script = "const o=require('./static/lunar-base/source/hologram-orbits.js');const r=require('./static/lunar-base/source/hologram/orbits.json');console.log(JSON.stringify([false,true].map(f=>o.strokes(17,{rings:r},f))));"
        if shutil.which('node'):
            runtime = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, text=True))
            for front, paths in zip((False, True), runtime):
                expected = orbit.strokes(17, rings, front)
                self.assertEqual(len(paths), len(expected))
                for actual, (points, width, alpha) in zip(paths, expected):
                    self.assertEqual(actual['width'], width)
                    self.assertAlmostEqual(actual['alpha'], alpha)
                    for actual_point, point in zip(actual['points'], points):
                        for a, b in zip(actual_point, point):
                            self.assertAlmostEqual(a, b)

    def test_original_platform_and_destination_size_are_preserved_in_every_frame(self):
        manifest = json.loads((SOURCE / 'manifest.json').read_text())
        self.assertEqual(manifest['logical_size'], [225, 245])
        self.assertEqual(manifest['anchor'], [112.5, 245])
        self.assertEqual(manifest['sprite_scale'], 3)
        self.assertTrue(manifest['ambient_only'])
        with Image.open(BASE / 'assets/astronaut-teal.png') as original:
            rocket = original.convert('RGBA').crop((0, 4007, 675, 4742))
        with Image.open(SOURCE / 'projection-mask.png') as source:
            mask = source.convert('L')
        self.assertEqual(list(mask.getbbox()), manifest['projection_bounds'])
        outside = ImageOps.invert(mask)
        blank = Image.new('RGBA', rocket.size)
        fixed = Image.composite(rocket, blank, outside).tobytes()
        with Image.open(BASE / 'assets/hologram-cycle.png') as source:
            atlas = source.convert('RGBA')
        self.assertEqual(list(atlas.size), manifest['atlas']['size'])
        self.assertTrue(all(size <= 4096 for size in atlas.size))
        self.assertEqual(len(manifest['frames']), 18)
        frames = []
        for record in manifest['frames']:
            x, y, width, height = record['rect']
            self.assertEqual([width, height], [675, 735])
            frame = atlas.crop((x, y, x + width, y + height))
            frames.append(frame)
            self.assertEqual(Image.composite(frame, blank, outside).tobytes(), fixed)
            self.assertEqual(frame.crop((0, 454, 675, 735)).tobytes(), rocket.crop((0, 454, 675, 735)).tobytes())
            self.assertEqual(frame.getchannel('A').getextrema(), (0, 255))
        self.assertEqual(frames[0].tobytes(), rocket.tobytes())
        self.assertNotEqual(frames[0].tobytes(), frames[15].tobytes())
        for original, subdued in ((frames[0], frames[16]), (frames[15], frames[17])):
            self.assertEqual(original.convert('RGB').tobytes(), subdued.convert('RGB').tobytes())
            self.assertLessEqual(max(abs(a-b) for a, b in zip(original.getchannel('A').tobytes(), subdued.getchannel('A').tobytes())), 4)

    def test_source_hashes_and_preview_period_match_the_manifest(self):
        manifest = json.loads((SOURCE / 'manifest.json').read_text())
        for record in [*manifest['sources'].values(), manifest['atlas'], manifest['ring_geometry']]:
            self.assertEqual(hashlib.sha256((SOURCE / record['path']).read_bytes()).hexdigest(), record['sha256'])
        with Image.open(SOURCE / 'hologram-loop.gif') as preview:
            self.assertEqual(preview.info['loop'], 0)
            self.assertEqual(sum(frame.info['duration'] for frame in ImageSequence.Iterator(preview)), 24000)
        self.assertEqual(manifest['hold_seconds'] * 2 + manifest['transition_seconds'] * 2,
                         manifest['period_seconds'])


if __name__ == '__main__':
    unittest.main()
