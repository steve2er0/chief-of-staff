"""Project presentation preserves owner context and distinguishes current agents."""
from pathlib import Path
import shutil
import subprocess
import unittest


@unittest.skipUnless(shutil.which('node'), 'Node is needed for presentation checks')
class ProjectsPanelTests(unittest.TestCase):
    def test_current_agent_status_latest_results_and_full_project_history(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const model=require(process.argv[1]),c={AgentModel:model,URL,document:{addEventListener(){}},setInterval(){},planModal(){},
 boardFilter:'',selectedProject:'p',view:'project',lunarScene:null,currentModal:null,
 esc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
 projectName:id=>id==='p'?'Lunar project':'Other project',date:x=>x||'',stateName:x=>x,
 recordHTML:r=>'<p>'+r.text+'</p>',savedReferencesHTML:p=>p.reference_files.map(r=>'<a>'+r.name+'</a>').join('')};
vm.createContext(c);for(const file of process.argv.slice(2))vm.runInContext(fs.readFileSync(file,'utf8'),c);
const p={id:'p',name:'Lunar project',vision:'Owner vision.\n\n'+('Keep the exact original wording. '.repeat(20))+'<full vision>',cwd:'/fixture/Lunar',
 vision_history:[{text:'Earlier owner vision.',source:'Owner',at:'2026-10-12'}],
 records:[{id:'q',category:'question',status:'open',text:'A current question.'},
 {id:'answered',category:'question',status:'answered',text:'A saved answer.'},
 {id:'obsolete',category:'question',status:'open',text:'Earlier request.',user_request_task_id:'old'},
 {id:'suggestion',category:'suggestion',status:'suggested',text:'Optional suggestion.'}],
 reference_files:[{id:'ref',name:'owner-reference.pdf'}],file_refs:['docs/original.txt'],accepted_results:[{task_id:'old',title:'Accepted record',summary:'Owner accepted this result.'}]};
const task=(id,agent,stamp,summary,extra={})=>({id,agent_id:agent,project_id:'p',title:'Task '+agent,created:stamp,finished_at:stamp,updated:stamp,
 state:'ready_for_review',config:{mode:'codex'},history:[],output_links:[],result:{status:'completed',summary},...extra});
const old=task('old','a','2026-10-12','Earlier result.',{state:'superseded',prior_state:'ready_for_review'});
const latest=task('latest','a','2026-10-14','Latest result.',{parent_task_id:'old'});
const other=task('other','b','2026-10-13','Other agent result.');
c.state={projects:[p,{id:'other',name:'Other project',vision:'Other goal.',records:[]}],tasks:[old,latest,other],messages:[{id:'m',project_id:'p',role:'user',created:'2026-10-13',text:'Keep this project conversation.'}],findings:[{project_id:'p',task_id:'old',text:'Saved partial finding.'}]};c.project=p;c.task=latest;
const before=JSON.stringify(c.state),html=vm.runInContext('renderProject()',c),fold=html.indexOf('class="previous-results project-earlier"');
assert.ok(fold>0);assert.ok(html.indexOf('Latest result.')<fold);assert.ok(html.indexOf('Other agent result.')<fold);assert.ok(html.indexOf('Earlier result.')>fold);
assert.equal((html.slice(0,fold).match(/data-result-row=/g)||[]).length,2);
assert.ok(html.includes('Earlier runs (1)'));assert.ok(html.includes('Back to Projects'));assert.ok(html.includes('Edit project'));
assert.ok(html.includes('&lt;full vision&gt;'));assert.ok(!html.slice(0,html.indexOf('<details id="project-context"')).includes('&lt;full vision&gt;'));
for(const text of ['Earlier owner vision.','A saved answer.','Earlier request.','Optional suggestion.','owner-reference.pdf','docs/original.txt','Owner accepted this result.','Keep this project conversation.','Saved partial finding.'])assert.ok(html.includes(text),text);
assert.ok(!/<details[^>]*\sopen[\s>]/.test(html));assert.equal(JSON.stringify(c.state),before);
assert.equal(vm.runInContext('currentAgents(project.id).length',c),2);
assert.equal(vm.runInContext('projectStatus(project).text',c),'2 finished agents · 1 open question');
assert.equal(vm.runInContext('projectPendingRecords(project).length',c),1);
const list=vm.runInContext('renderProjects()',c);assert.ok(!list.includes('Open project'));assert.ok(!list.includes('Project folder'));assert.ok(!list.includes('class="primary"'));
c.view='projects';const listSignature=vm.runInContext('projectsPanelSignature()',c);
latest.latest_update='Detailed progress update';assert.equal(vm.runInContext('projectsPanelSignature()',c),listSignature);
c.state.tasks.push(task('unrelated','c','2026-10-14','Other project work.',{project_id:'other',state:'running',result:null}));
c.view='project';const projectSignature=vm.runInContext('projectsPanelSignature()',c);c.state.tasks.at(-1).latest_update='Unrelated progress';
assert.equal(vm.runInContext('projectsPanelSignature()',c),projectSignature);
latest.state='running';latest.live_requests=[{id:'native',status:'pending'}];
assert.equal(vm.runInContext('projectAgentNeedsYou(task)',c),true);
assert.ok(vm.runInContext('projectStatus(project).text',c).includes('needs attention'));
latest.live_requests[0].status='sending';assert.equal(vm.runInContext('projectAgentNeedsYou(task)',c),false);
assert.equal(vm.runInContext('projectAgentLabel(task)',c),'Sending response');
assert.ok(vm.runInContext('projectStatus(project).text',c).includes('1 working'));
latest.live_requests=[];latest.owner_attention={state:'needs_user',items:[{id:'q',answered:false}]};
p.records.push({id:'linked',category:'question',status:'open',text:'Linked request.',user_request_task_id:'latest'});
assert.equal(vm.runInContext('projectStatus(project).records.length',c),1,'Linked request is counted with its agent, not twice');
latest.owner_attention.items[0].answered=true;p.records.at(-1).status='answered';
assert.equal(vm.runInContext('projectAgentNeedsYou(task)',c),false);
p.records[0].status='answered';latest.state='paused';
assert.equal(vm.runInContext('projectStatus(project).tone',c),'quiet');
latest.config.mode='simulated';assert.ok(vm.runInContext('projectStatus(project).text',c).includes('Includes simulated agents'));
'''
        run = subprocess.run(['node', '-e', script, str(root/'static/agent-model.js'),
                              str(root/'static/task-feedback.js'), str(root/'static/agents.js')],
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
