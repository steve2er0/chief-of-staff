"""Regression checks for safe reports, retained turns and registered display art."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class DisplayArtworkTests(unittest.TestCase):
    def test_display_regions_fit_textures_and_frames_keep_their_baseline(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest('Pillow is needed only for artwork checks')
        base = ROOT / 'static/lunar-base'
        manifest = json.loads((base / 'source/display-asset-manifest.json').read_text())
        for name, record in manifest['files'].items():
            path = base / 'assets' / name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), record['sha256'])
            with Image.open(path) as image:
                self.assertEqual(list(image.size), record['size'])
        with Image.open(base / 'assets/astronaut-teal.png') as image:
            teal = image.copy()
        with Image.open(base / 'assets/astronaut-amber.png') as image:
            amber = image.copy()
        for name, region in manifest['regions'].items():
            self.assertLessEqual(region['x'] + region['width'], teal.width)
            self.assertLessEqual(region['y'] + region['height'], teal.height)
            if name not in ['crew', 'work', 'attention']:
                continue
            self.assertLessEqual(region['y'] + region['height'], amber.height)
            scale = region['scale']
            cell_width = (96 if name == 'work' else 64) * scale
            for row in range(region['height'] // (64 * scale)):
                for col in range(region['width'] // cell_width):
                    x, y = region['x'] + col * cell_width, region['y'] + row * 64 * scale
                    frame = teal.crop((x, y, x + cell_width, y + 64 * scale))
                    bounds = frame.getbbox()
                    self.assertIsNotNone(bounds, (name, row, col))
                    self.assertEqual(bounds[1], 8 * scale, (name, row, col))
                    self.assertEqual(bounds[3], 58 * scale, (name, row, col))


@unittest.skipUnless(shutil.which('node'), 'Node is needed for client logic checks')
class ReportDisplayTests(unittest.TestCase):
    def test_markdown_is_escaped_and_latest_results_retain_earlier_turns(self):
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener:()=>{}},setInterval:()=>{},planModal:()=>{},
 esc:x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),
 boardFilter:'',projectName:()=> 'Project',date:x=>x,stateName:x=>x};
vm.createContext(c);
for(const file of process.argv.slice(1))vm.runInContext(fs.readFileSync(file,'utf8'),c);
c.input='**Done**\n\n- One\n- Two\n\n[Docs](https://example.com) [Bad](javascript:alert)\n\n<img src=x onerror=alert(1)>\n\n```\n<script>bad</script>\n```';
const html=vm.runInContext('reportHTML(input)',c);
assert.ok(html.includes('<strong>Done</strong>'));
assert.ok(html.includes('<ul><li>One</li><li>Two</li></ul>'));
assert.ok(html.includes('href="https://example.com"'));
assert.ok(!html.includes('href="javascript:'));
assert.ok(!html.includes('<img'));
assert.ok(!html.includes('<script>'));
assert.ok(html.includes('&lt;img'));
assert.ok(html.includes('<pre><code>&lt;script&gt;'));
c.task={title:'Please inspect the lunar display and preserve the complete original instructions. More detail.',purpose:'Full instructions'};
const before=JSON.stringify(c.task);
assert.ok(vm.runInContext('AgentModel.title(task)',c).length<=56);
assert.equal(JSON.stringify(c.task),before);
const task=(id,agent,created,summary)=>({id,agent_id:agent,project_id:'p',created,finished_at:created,state:'ready_for_review',title:'Display check',result:{summary},output_links:[]});
c.state={projects:[{id:'p'}],tasks:[task('old','a','2026-10-12','Earlier outcome'),task('new','a','2026-10-13','Latest outcome'),task('other','b','2026-10-13','Other outcome')]};
const results=vm.runInContext('renderResults()',c),fold=results.indexOf('<details class="previous-results">');
assert.ok(fold>0);
assert.ok(results.indexOf('Latest outcome')<fold);
assert.ok(results.indexOf('Other outcome')<fold);
assert.ok(results.indexOf('Earlier outcome')>fold);
assert.equal(c.state.tasks.length,3);
'''
        run = subprocess.run(['node', '-e', script, str(ROOT / 'static/agent-model.js'),
                              str(ROOT / 'static/task-feedback.js'), str(ROOT / 'static/agents.js')],
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
