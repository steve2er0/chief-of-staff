"""Artifact cards use authenticated local paths and preserve download fallbacks."""
from pathlib import Path
import shutil
import subprocess
import unittest


@unittest.skipUnless(shutil.which('node'), 'Node is needed for artifact presentation checks')
class ArtifactUITests(unittest.TestCase):
    def test_relative_paths_and_cards_do_not_fetch_external_or_unreferenced_images(self):
        source = Path(__file__).resolve().parents[1] / 'static/artifacts.js'
        script = r'''
const assert=require('node:assert/strict'),artifacts=require(process.argv[1]);
const task={id:'task <one>',context:{cwd:'/project'},output_links:[{name:'saved.txt',source_path:'plots/chart.png',label:'Chart preview'}]};
for(const path of ['../secret.png','plots/../secret.png','/other/image.png','https://external.invalid/image.png','//host/image.png','C:\\secret.png'])assert.equal(artifacts.relative(task,path),null,path);
assert.equal(artifacts.relative(task,'/project/plots/chart.png:12'),'plots/chart.png');
assert.equal(artifacts.relative({context:{cwd:'C:\\Project'}},'c:\\project\\plots\\chart.png'),'plots/chart.png');
const before=JSON.stringify(task),text='![Chart](plots/chart.png) [Notes](notes.txt) `notes.txt` ![Private](https://bad.invalid/private.png)';
const html=artifacts.render(task,text);
assert.ok(html.includes('/api/output-preview/task%20%3Cone%3E/saved.txt'));assert.ok(html.includes('/api/artifact/task%20%3Cone%3E/notes.txt'));
assert.ok(html.includes('Show in folder'));assert.ok(html.includes('Enlarge image'));assert.ok(!html.includes('bad.invalid'));
assert.equal((html.match(/<figure/g)||[]).length,2);assert.ok(!html.includes('task <one>'));
const results=artifacts.files(task);assert.ok(results.includes('<img'),'Friendly display labels must not hide raster previews');
assert.ok(results.includes('Chart preview'));assert.ok(results.includes('download'));
assert.equal(JSON.stringify(task),before);
assert.ok(!artifacts.render(task,'No files were reported.').includes('<img'));
assert.equal(artifacts.render(task,'`../secret.png`'),'');
'''
        result = subprocess.run(['node','-e',script,str(source)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
