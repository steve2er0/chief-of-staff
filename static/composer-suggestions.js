/* Mount suggestions on the existing composer; acceptance is a normal draft input event. */
'use strict';
const agentSuggestionController=FollowupSuggestions.controller({
  read(){
    const form=$('#agent-reply-form'),input=form?.elements.text,button=form?.querySelector('[data-accept-followup]');
    const visible=currentModal?.type==='task'&&$('#modal').open&&$('#agent-panel')?.dataset.tab==='conversation'&&
      form?.isConnected&&!form.hidden&&form.dataset.sending!=='true'&&document.visibilityState!=='hidden';
    return {enabled:visible&&state.config.followup_suggestions!==false,
      focused:visible&&(document.activeElement===input||document.activeElement===button),empty:input?.value==='',
      context:visible?FollowupSuggestions.context(state,form.dataset.taskId):null};
  },
  show(suggestion){
    const form=$('#agent-reply-form');if(!form)return;
    const input=form.elements.text,ghost=form.querySelector('[data-followup-ghost]'),hint=form.querySelector('[data-followup-hint]');
    ghost.textContent=suggestion?.text||'';ghost.hidden=!suggestion;hint.hidden=!suggestion;
    form.toggleAttribute('data-has-followup',Boolean(suggestion));
    if(suggestion)input.setAttribute('aria-describedby','agent-followup-description');else input.removeAttribute('aria-describedby');
    const description=form.querySelector('#agent-followup-description');
    description.textContent=suggestion?`Suggested draft: ${suggestion.text} Press Tab or Use suggestion to edit it. Escape dismisses. Sending is separate.`:'';
  }
});
function syncAgentSuggestions(){agentSuggestionController.sync();}
function resetAgentSuggestions(){agentSuggestionController.reset();}
function acceptAgentSuggestion(value){
  const input=$('#agent-reply-form')?.elements.text;if(!value||!input||input.value!=='')return;
  input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus({preventScroll:true});input.setSelectionRange(value.length,value.length);
}
document.addEventListener('keydown',event=>{
  if(!event.target.matches('#agent-reply-form textarea, #agent-reply-form [data-accept-followup]'))return;
  // Capture Escape before the panel's existing dismissal listener.
  acceptAgentSuggestion(agentSuggestionController.keydown(event));
},true);
for(const name of ['beforeinput','input','compositionstart'])document.addEventListener(name,event=>{
  if(event.target.matches('#agent-reply-form textarea'))agentSuggestionController.dismiss();
});
document.addEventListener('click',event=>{
  if(event.target.closest('[data-accept-followup]'))acceptAgentSuggestion(agentSuggestionController.accept());
});
// Pointer acceptance keeps the textarea's focus through the button's click event.
document.addEventListener('pointerdown',event=>{
  if(event.target.closest('[data-accept-followup]'))event.preventDefault();
});
document.addEventListener('focusin',syncAgentSuggestions);
document.addEventListener('focusout',()=>queueMicrotask(syncAgentSuggestions));
document.addEventListener('submit',event=>{if(event.target.id==='agent-reply-form')resetAgentSuggestions();},true);
document.addEventListener('close',event=>{if(event.target.id==='modal')resetAgentSuggestions();},true);
document.addEventListener('visibilitychange',()=>{resetAgentSuggestions();if(document.visibilityState!=='hidden')syncAgentSuggestions();});
window.addEventListener('pagehide',resetAgentSuggestions);
window.addEventListener('popstate',resetAgentSuggestions);
window.addEventListener('hashchange',resetAgentSuggestions);
