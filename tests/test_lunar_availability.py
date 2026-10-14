"""Synthetic availability mapping and separated raster asset validation."""
import json
from pathlib import Path
import shutil
import subprocess
import unittest

class LunarAvailabilityTests(unittest.TestCase):
    def test_supported_state_and_transition_contract(self):
        node=shutil.which('node')
        if not node:self.skipTest('Node unavailable')
        root=Path(__file__).resolve().parents[1]
        result=subprocess.run([node,str(root/'static/lunar-base/source/test_availability_model.cjs')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)

    def test_registered_rest_frames_and_provenance(self):
        from hashlib import sha256
        root=Path(__file__).resolve().parents[1]/'static/lunar-base/source/availability'
        manifest=json.loads((root/'manifest.json').read_text())
        self.assertEqual(sha256((root/manifest['master']).read_bytes()).hexdigest(),manifest['master_sha256'])
        self.assertEqual([f['pose'] for f in manifest['frames']],['neutral','seated','earth','stretch'])
        for frame in manifest['frames']:
            self.assertEqual(frame['foot_anchor'],[96,174])
            self.assertEqual(frame['bbox'][3],174)
            self.assertGreater(frame['bbox'][0],0)
            self.assertLess(frame['bbox'][2],192)
