"""Status navigation and the folder-only creation UI never rewrite saved context."""
from pathlib import Path
import shutil
import subprocess
import unittest


@unittest.skipUnless(shutil.which('node'), 'Node is needed for UI projection checks')
class NavigationTests(unittest.TestCase):
    def run_js(self, script, *files):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(['node', '-e', script, *[str(root / name) for name in files]], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_status_navigation_keeps_exact_states_and_direct_conversation_links(self):
        self.run_js(r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const model=require(process.argv[1]);
const c={AgentModel:model,document:{addEventListener(){}},setInterval(){},planModal(){},
 esc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
 date:x=>x,stateName:x=>x,projectName:id=>'Project '+id};
vm.createContext(c);for(const file of process.argv.slice(2))vm.runInContext(fs.readFileSync(file,'utf8'),c);
const task=(id,state,more={})=>({id,agent_id:id,project_id:'p',title:'<Agent '+id+'>',state,created:'2026-10-15',config:{mode:'codex'},...more});
c.state={tasks:[task('running','running'),task('queued','queued'),task('done','ready_for_review'),task('paused','paused'),task('stopped','cancelled'),task('failed','failed'),task('input','running',{live_requests:[{status:'pending'}]}),task('old','superseded')],jobs:[],projects:[],attention:[]};
const before=JSON.stringify(c.state),ids=kind=>vm.runInContext(`statusAgents('${kind}').map(t=>t.id).join(',')`,c);
assert.equal(ids('working'),'running,queued');assert.equal(ids('finished'),'done,paused,stopped');assert.equal(ids('needs'),'failed,input');
const working=vm.runInContext('renderWorking()',c),finished=vm.runInContext('renderFinished()',c);
assert.ok(working.includes('data-task="running"'));assert.ok(working.includes('Conversation →'));assert.ok(!working.includes('<Agent running>'));
for(const text of ['Finished','Paused','Stopped'])assert.ok(finished.includes(text),text);
c.project={id:'p',name:'Project p'};const projects=vm.runInContext('projectConversationLinks(project)',c);
assert.ok(projects.includes('data-task="input"'));assert.ok(projects.includes('Open conversation'));
assert.equal(JSON.stringify(c.state),before);
c.state.projects=[{id:'p',records:[{id:'question',user_request_task_id:'input'}]}];
c.state.attention=[{kind:'record',target_id:'question',project_id:'p'}];
assert.equal(vm.runInContext("attentionCoveredAgents().has('input')",c),true);
const counters={'#working-count':{},'#finished-count':{},'#attention-count':{}};c.$=selector=>counters[selector];
vm.runInContext('syncStatusNavigation()',c);
assert.equal(counters['#attention-count'].textContent,2,'A linked question is counted once, plus the unrelated failed agent');
''', 'static/agent-model.js', 'static/task-feedback.js', 'static/agents.js', 'static/status-navigation.js')

    def test_new_project_only_asks_for_the_working_folder_and_edit_keeps_context(self):
        self.run_js(r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={document:{addEventListener(){}},projectForm(){},taskModal(){},renderProjects(){},renderProject(){},
 esc:x=>String(x??''),modal(...args){c.dialog=args;},initReferenceFiles(){c.references=true;},$:()=>({}),
 state:{config:{mode:'codex'},projects:[{id:'p',vision:'Saved vision',name:'Saved name',brief:{milestone:'Existing milestone',success:'Evidence',constraints:'Constraints'},records:[]}]},
 pathFields:()=>'<input name="cwd">',setInterval(){}};
vm.createContext(c);vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
vm.runInContext('projectForm()',c);let html=c.dialog[2];
assert.deepEqual([...html.matchAll(/name="([^"]+)"/g)].map(x=>x[1]),['cwd']);
assert.ok(html.includes('required'));assert.ok(html.includes('Choose folder'));assert.ok(!c.references);
vm.runInContext("projectForm('p')",c);html=c.dialog[2];
for(const value of ['Saved vision','Saved name','Existing milestone','Evidence','Constraints'])assert.ok(html.includes(value));
assert.equal(c.state.projects[0].brief.milestone,'Existing milestone');
''', 'static/workspace.js')


if __name__ == '__main__':
    unittest.main()
