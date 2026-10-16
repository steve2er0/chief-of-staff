"""Offline equation rendering and explicit agent composer controls; synthetic data."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('node'), 'Node is needed for conversation checks')
class ConversationToolsTests(unittest.TestCase):
    def run_js(self, script):
        run = subprocess.run(['node', '-e', script, str(ROOT)], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

    def test_equations_render_locally_and_preserve_markdown_and_code(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),root=process.argv[1];
const tools=require(root+'/static/conversation-tools.js'),c={document:{addEventListener(){}},setInterval(){},
esc:x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]))};
vm.createContext(c);vm.runInContext(fs.readFileSync(root+'/static/task-feedback.js','utf8'),c);
const render=text=>tools.renderMessage(text,c.reportHTML);
const html=render('**Equation** $x_1^2 + \\alpha$\n\n$$\\frac{a+b}{\\sqrt{x}} = \\sum_{i=1}^{n} i$$');
assert.match(html,/<strong>Equation<\/strong>/);assert.match(html,/display="inline"/);assert.match(html,/display="block"/);
for(const tag of ['msubsup','mfrac','msqrt','munderover'])assert.ok(html.includes('<'+tag+'>'),tag);
assert.ok(html.includes('α'));assert.ok(!html.includes('COSMATHSEGMENT'));
assert.match(render('\\(E=mc^2\\) and \\[\\int_0^1 x\\,dx\\]'),/<msup>/);
assert.match(render('$$\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}$$'),/<mtable>/);
for(const code of ['`$x^2$`','```tex\n$$x^2$$\n```','``\\(x\\)``'])assert.ok(!render(code).includes('<math'));
assert.ok(!render('Price $5 and $10.').includes('<math'));
assert.ok(!render('Escaped \\$x$').includes('<math'));
const source=fs.readFileSync(root+'/static/conversation-tools.js','utf8');
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|eval)\s*\(/.test(source));
''')

    def test_streaming_malformed_and_untrusted_equations_fall_back_safely(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),tools=require(process.argv[1]+'/static/conversation-tools.js');
const escape=x=>x.replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
for(const text of ['$$\\frac{x}{$$','$\\unknown{x}$','\\[unfinished','$$'+'{'.repeat(60)+'x'+'}'.repeat(60)+'$$']){
 const html=tools.renderMessage(text,escape);assert.ok(!html.includes('<math'));assert.equal(html,escape(text));
}
const equation='Before $\\frac{1}{\\sqrt{x}}$ after';
for(let i=0;i<=equation.length;i++)assert.doesNotThrow(()=>tools.renderMessage(equation.slice(0,i),escape));
for(const complete of ['$$\\frac{1}{\\sqrt{x}}$$','\\[x_1^2+\\alpha\\]','\\(x^2\\)']){
 for(let i=0;i<complete.length;i++){const partial=complete.slice(0,i);assert.equal(tools.renderMessage(partial,escape),escape(partial));}
 assert.ok(tools.renderMessage(complete,escape).includes('<math'));
}
for(const text of ['$<script>alert(1)</script>$','$\\text{<img src=x onerror=alert(1)>}$','$\\href{https://bad.invalid}{x}$']){
 const html=tools.renderMessage(text,escape);assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href='));
}
assert.equal(tools.mathHTML('x'.repeat(12001),false),null);
assert.equal(tools.mathHTML('x^2^3',false),null);
''')

    def test_math_never_substitutes_into_url_attributes_or_code(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),root=process.argv[1],tools=require(root+'/static/conversation-tools.js');
const c={document:{addEventListener(){}},setInterval(){},esc:x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]))};
vm.createContext(c);vm.runInContext(fs.readFileSync(root+'/static/task-feedback.js','utf8'),c);
for(const text of ['[Link](https://example.invalid/$x$)', '[Equation $x$](https://example.invalid)', '![Plot](https://example.invalid/$x$)', '[Bad](javascript:$x$)']){
 const html=tools.renderMessage(text,c.reportHTML);assert.ok(!html.includes('<math'));assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('<img'));
}
const text='COSMATHSEGMENT0END $x$';assert.match(tools.renderMessage(text,c.reportHTML),/COSMATHSEGMENT0END/);
''')

    def test_go_ahead_is_a_normal_message_with_existing_permissions(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),tools=require(process.argv[1]+'/static/conversation-tools.js');
const task={id:'a',state:'ready_for_review',result:{status:'completed'},conversation:[],live_requests:[]};
const before=JSON.stringify(task);
assert.equal(tools.actionState(task).goDisabled,false,'No special planning request or report is required');
assert.throws(()=>tools.instruction('submit','  ',task),/Write a message/);
assert.equal(tools.instruction('submit','Please plan a small chart.',task),'Please plan a small chart.');
const go=tools.instruction('go','',task);
assert.ok(go.startsWith("Let's go!"));assert.ok(go.includes('existing permissions'));
assert.ok(!go.includes('Reviewed plan'));assert.ok(!go.includes('I have reviewed'));
assert.ok(tools.instruction('go','Keep the original data.',task).endsWith('Additional instructions:\nKeep the original data.'));
assert.equal(JSON.stringify(task),before);
for(const state of ['queued','running','stopping','superseded','unknown']){
 const busy={...task,state};assert.equal(tools.actionState(busy).goDisabled,true);assert.throws(()=>tools.instruction('go','',busy));
}
for(const state of ['ready_for_review','accepted','failed','blocked','paused','cancelled','interrupted'])assert.equal(tools.actionState({...task,state}).goDisabled,false);
for(const extra of [{live_requests:[{status:'pending'}]},{live_requests:[{status:'sending'}]},{owner_attention:{state:'needs_user'}}]){
 const blocked={...task,...extra};assert.equal(tools.actionState(blocked).goDisabled,true);assert.throws(()=>tools.instruction('go','',blocked));
}
assert.equal(tools.actionState(task,true).submitDisabled,true);assert.equal(tools.actionState(task,true).goDisabled,true);
assert.throws(()=>tools.instruction('go','x'.repeat(6000),task),/message limit/);
assert.throws(()=>tools.instruction('plan','Plan it.',task),/Unknown composer action/);
task.conversation=[{role:'agent',text:'x'.repeat(10000)}];assert.equal(tools.instruction('go','',task),go,'Do not resend arbitrary report text');
''')

    def test_enter_ignores_ime_modifiers_and_key_repeat(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),tools=require(process.argv[1]+'/static/conversation-tools.js');
assert.equal(tools.enterSubmits({key:'Enter'}),true);
for(const extra of [{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{keyCode:229},{repeat:true},{defaultPrevented:true}])assert.equal(tools.enterSubmits({key:'Enter',...extra}),false);
assert.equal(tools.enterSubmits({key:'Enter'},true),false);assert.equal(tools.enterSubmits({key:'Tab'}),false);
''')

    def test_composer_keyboard_submits_only_actual_drafts_and_preserves_ime(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),root=process.argv[1],handlers={};let submissions=0;
const submit={disabled:false},form={dataset:{taskId:'a'},querySelector:()=>submit,requestSubmit(b){assert.equal(b,submit);submissions++;}};
const input={value:'Actual draft',form,matches:s=>s.includes('textarea'),closest:()=>null};
const c={ConversationTools:require(root+'/static/conversation-tools.js'),document:{addEventListener(k,f){(handlers[k]??=[]).push(f);}},setInterval(){},planModal(){}};
vm.createContext(c);vm.runInContext(fs.readFileSync(root+'/static/agents.js','utf8'),c);
function key(extra={}){let prevented=false;const event={target:input,key:'Enter',preventDefault(){prevented=true;},...extra};for(const f of handlers.keydown)f(event);return prevented;}
assert.equal(key(),true);assert.equal(submissions,1);assert.equal(key({shiftKey:true}),false);assert.equal(submissions,1);
form.dataset.sending='true';key();assert.equal(submissions,1);form.dataset.sending='false';
input.value='';key();assert.equal(submissions,1); // A visible ghost has no actual draft value.
input.value='IME draft';for(const f of handlers.compositionstart)f({target:input});assert.equal(key(),false);assert.equal(submissions,1);
for(const f of handlers.compositionend)f({target:input});key();assert.equal(submissions,2);
submit.disabled=true;key();assert.equal(submissions,2);
''')

    def test_composer_buttons_feedback_and_message_integration(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),root=process.argv[1];
const c={AgentModel:require(root+'/static/agent-model.js'),ConversationTools:require(root+'/static/conversation-tools.js'),
 document:{addEventListener(){}},setInterval(){},planModal(){},date:x=>x,stateName:x=>x,
 esc:x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]))};
vm.createContext(c);for(const name of ['task-feedback','agents'])vm.runInContext(fs.readFileSync(root+'/static/'+name+'.js','utf8'),c);
c.task={id:'a',state:'ready_for_review',session_id:'saved',conversation:[{role:'agent',id:'m',text:'$x^2$',at:'now'}]};c.state={tasks:[c.task]};
vm.runInContext("agentReplyFeedback.set('a','Message queued for this agent.')",c);
const html=vm.runInContext('replyComposerHTML(task)',c);assert.ok(html.includes('>Submit</button>'));assert.ok(!html.includes('>Plan</button>'));assert.ok(html.includes(">Let's go!</button>"));
assert.ok(!html.includes('native Plan'));assert.ok(!html.includes('agent-planning-note'));assert.ok(html.includes('Shift+Enter'));assert.ok(html.includes('Message queued for this agent.'));
assert.ok(html.indexOf('id="agent-reply-status"')>html.indexOf("Let's go!</button>"));
assert.match(vm.runInContext('agentConversationHTML(task)',c),/<math/);
''')

    def test_repeated_updates_preserve_reading_position_and_draft_focus(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),root=process.argv[1];
const older={id:'old',agent_id:'crew',state:'superseded',created:'2026-10-14T01:00:00Z',output_links:[],context:{cwd:'/fixture'}};
const task={id:'now',agent_id:'crew',parent_task_id:'old',state:'ready_for_review',created:'2026-10-14T02:00:00Z',output_links:[],context:{cwd:'/fixture'},
 conversation:[{role:'agent',task_id:'old',id:'first',text:'Saved [plot](plot.png).',at:older.created},
 {role:'agent',task_id:'now',id:'last',text:'Saved [report](notes.txt).',at:'2026-10-14T02:01:00Z'}]};
let writes=0,frames=0;const draft={value:'Keep my unfinished instructions.'},panel={dataset:{followLatest:'false',tab:'conversation'}},tab={dataset:{},setAttribute(){}};
const scroll={scrollTop:250,getBoundingClientRect:()=>({top:100,bottom:500})},newMessages={hidden:true};
const transcript={dataset:{},querySelectorAll(selector){return selector==='[data-message-key]'?[anchor]:[];},
 set innerHTML(value){writes++;this.html=value;},get innerHTML(){return this.html;}};
const anchor={dataset:{messageKey:'old:first'},parentElement:transcript,getBoundingClientRect:()=>({top:150+writes*70,bottom:210+writes*70,height:60})};
const c={AgentModel:require(root+'/static/agent-model.js'),AgentArtifacts:require(root+'/static/artifacts.js'),ConversationTools:require(root+'/static/conversation-tools.js'),
 state:{tasks:[older,task,{id:'unrelated',agent_id:'other',output_links:[]}]},task,
 document:{activeElement:draft,addEventListener(){}},setInterval(){},planModal(){},requestAnimationFrame(){frames++;},date:x=>x,stateName:x=>x,
 esc:x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),
 $:selector=>({'#agent-panel':panel,'#agent-conversation-scroll':scroll,'[data-agent-transcript]':transcript,'#agent-new-messages':newMessages,'[data-agent-tab=conversation]':tab}[selector])};
vm.createContext(c);for(const name of ['task-feedback','agents'])vm.runInContext(fs.readFileSync(root+'/static/'+name+'.js','utf8'),c);
transcript.dataset.signature=vm.runInContext('agentTranscriptSignature(task)',c);
const sync=()=>vm.runInContext('syncAgentTranscript(task)',c);
assert.equal(sync(),false);assert.equal(writes,0);assert.equal(scroll.scrollTop,250);assert.equal(c.document.activeElement,draft);
task.updated='new heartbeat';task.latest_update='Cosmetic progress';c.state.tasks[2].output_links.push({name:'outside',source_path:'other.png'});
assert.equal(sync(),false);assert.equal(writes,0);assert.equal(frames,0);assert.equal(newMessages.hidden,true);
// A captured output on an earlier run changes its preview route despite unchanged messages.
older.output_links.push({name:'captured-plot.png',source_path:'plot.png'});
assert.equal(sync(),true);assert.equal(writes,1);assert.equal(scroll.scrollTop,320);assert.equal(c.document.activeElement,draft);
assert.ok(transcript.html.includes('/api/output-preview/old/captured-plot.png'));assert.ok(transcript.html.includes('data-reveal-artifact="now"'));
assert.ok(transcript.html.includes('notes.txt'));assert.equal(draft.value,'Keep my unfinished instructions.');assert.equal(frames,0);assert.equal(newMessages.hidden,false);
assert.equal(sync(),false);assert.equal(writes,1);assert.equal(scroll.scrollTop,320);
task.output_links.push({name:'captured-notes.txt',source_path:'notes.txt'});
assert.equal(sync(),true);assert.equal(writes,2);assert.ok(transcript.html.includes('/api/output/now/captured-notes.txt'));assert.equal(c.document.activeElement,draft);
assert.equal(sync(),false);assert.equal(writes,2);assert.equal(scroll.scrollTop,390);
panel.dataset.followLatest='true';task.conversation.at(-1).text+=' Additional detail.';
assert.equal(sync(),true);assert.equal(frames,1);assert.equal(sync(),false);assert.equal(frames,1);
''')

    def test_artifacts_are_available_for_agent_files_and_never_user_drafts(self):
        self.run_js(r'''
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),root=process.argv[1];
const c={AgentModel:require(root+'/static/agent-model.js'),AgentArtifacts:require(root+'/static/artifacts.js'),document:{addEventListener(){}},setInterval(){},planModal(){},date:x=>x,stateName:x=>x,
esc:x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]))};
vm.createContext(c);for(const name of ['task-feedback','agents'])vm.runInContext(fs.readFileSync(root+'/static/'+name+'.js','utf8'),c);
c.task={id:'a',state:'ready_for_review',created:'2026-10-14T00:00:00Z',context:{cwd:'/fixture'},output_links:[{name:'report-copy',source_path:'notes.txt'}],
conversation:[{role:'user',id:'draft',text:'Please read [private](private.png).',at:'2026-10-14T00:01:00Z'},
{role:'agent',id:'reply',text:'Saved [report](notes.txt).',at:'2026-10-14T00:02:00Z'}]};c.state={tasks:[c.task]};
const html=vm.runInContext('agentConversationHTML(task)',c);assert.ok(html.includes('/api/output/a/report-copy'));assert.ok(html.includes('data-reveal-artifact="a"'));
assert.ok(!html.includes('/api/artifact/a/private.png'));assert.ok(!html.includes('<img'));
''')
