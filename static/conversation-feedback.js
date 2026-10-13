'use strict';

const conversationSends = new Map();

function activeConversationJob(pid) {
  return state.jobs.filter(j=>j.project_id===pid&&['conversation','intake'].includes(j.kind)&&j.state==='running').at(-1);
}

function messageDeliveryHTML(message) {
  const delivery=message.delivery;if(!delivery)return '';
  if(delivery.method==='local')return '<small class="message-delivery">Saved locally</small>';
  const job=state.jobs.find(j=>j.id===delivery.job_id);
  const received=job?.state==='completed'&&job.proposal_id;
  const outcome=received?'Reply received':({failed:'Reply failed',blocked:'Reply paused',cancelled:'Stopped',interrupted:'Interrupted'})[job?.state];
  const error=job&&['failed','blocked','interrupted'].includes(job.state);
  return `<small class="message-delivery${error?' delivery-error':''}"><span aria-hidden="true">✓</span> Sent to CoS${outcome?' · '+outcome:''}</small>`;
}

function conversationActivityHTML(pid) {
  const job=activeConversationJob(pid);if(!job)return '';
  const setup=job.kind==='intake';
  return `<article class="message cos thinking-message" role="status" aria-live="polite" aria-busy="true"><div class="thinking-heading"><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span><strong>${setup?'CoS is reviewing your project…':'CoS is thinking…'}</strong></div><p>${setup?'Getting oriented to your vision and available files.':'Message sent. A reply will appear here.'}</p><button type="button" data-stop-job="${esc(job.id)}" class="text-button">Stop</button></article>`;
}

function conversationSignature(pid) {
  return JSON.stringify({messages:state.messages.filter(m=>m.project_id===pid).map(m=>[m.id,m.delivery, state.jobs.find(j=>j.id===m.delivery?.job_id)?.state]),
    active:activeConversationJob(pid)?.id, review:projectReview(pid)?.state});
}

function syncConversationFeedback(freshSnapshot=false) {
  if(view!=='project'||typeof projectTab==='undefined'||projectTab!=='conversation'||$('#modal')?.open)return;
  const form=$('#conversation-form'), transcript=$('.conversation');if(!form||!transcript)return;
  const pid=form.dataset.projectId, project=state.projects.find(p=>p.id===pid);if(!project)return;
  const signature=conversationSignature(pid);
  if(transcript.dataset.signature!==signature){
    const atEnd=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<30, scroll=transcript.scrollTop;
    const historyOpen=!!transcript.querySelector('.earlier-conversation[open]');
    transcript.innerHTML=conversationTranscriptHTML(project);
    transcript.dataset.signature=signature;
    if(historyOpen)transcript.querySelector('.earlier-conversation')?.setAttribute('open','');
    transcript.scrollTop=atEnd?transcript.scrollHeight:scroll;
  }
  const notes=$('#project-conversation-notes'), jobs=$('#conversation-jobs');
  for(const [target,html] of [[notes,projectNotesHTML(project)],[jobs,renderProjectJobs(pid,true)+projectReviewHTML(project)]]){
    if(target&&target.feedbackHTML!==html){target.innerHTML=html;target.feedbackHTML=html;}
  }
  const request=conversationSends.get(pid), sending=request?.phase==='sending';
  if(freshSnapshot&&request){
    request.refreshError=false;
    // The snapshot can confirm delivery even when the POST acknowledgement
    // was lost. Match its request ID, never a similar earlier message.
    if(request.phase==='failed'&&!request.rejected&&state.messages.some(m=>m.delivery?.request_id===request.id)){
      request.phase='sent';
      if(conversationDrafts.get(pid)===request.text)conversationDrafts.delete(pid);
      if(form.elements.text.value===request.text&&form.elements.method.value===request.method){form.elements.text.value='';delete form.dataset.dirty;}
      toast(request.method==='codex'?'Message sent to CoS.':'Message saved locally.');
    }
  }
  const waiting=!!activeConversationJob(pid)&&form.elements.method.value==='codex';
  const sameDraft=request&&request.text===form.elements.text.value&&request.method===form.elements.method.value;
  const failed=request?.phase==='failed'&&sameDraft;
  const button=form.querySelector('[type=submit]');
  button.disabled=sending||waiting;
  button.textContent=sending?'Sending…':waiting?'Waiting for CoS…':failed?'Retry send':'Send to CoS →';
  form.elements.text.readOnly=sending;
  form.elements.method.disabled=sending;
  form.setAttribute('aria-busy',String(sending));
  const status=$('#conversation-delivery');
  status.hidden=!sending&&!failed&&!request?.refreshError;
  status.className='composer-delivery'+(failed?' delivery-error':'');
  status.textContent=sending?'Sending your message to CoS…':failed?
    (request.rejected?'Message wasn’t sent. '+request.error:'Couldn’t confirm delivery. Retry to check that your message arrived.'):
    request?.refreshError?'Message sent. Reconnecting to receive the reply.':'';
}

async function sendConversation(form, raw) {
  const pid=form.dataset.projectId, previous=conversationSends.get(pid);
  // An uncertain network result can be retried safely with the same request ID.
  const request={text:raw.text,method:raw.method,phase:'sending',
    id:previous?.phase==='failed'&&previous.text===raw.text&&previous.method===raw.method?previous.id:crypto.randomUUID()};
  conversationSends.set(pid,request);syncConversationFeedback();
  let result;
  try{result=await api('discuss',{project_id:pid,...raw},request.id,false);}
  catch(error){request.phase='failed';request.error=error.message;request.rejected=error.status>=400&&error.status<500;syncConversationFeedback();throw request.rejected?error:new Error('Couldn’t confirm delivery. Your draft is kept while we check for a reply.');}
  request.phase='sent';request.resultId=result.id;
  if(!state.messages.some(m=>m.id===result.message.id))state.messages.push(result.message);
  if(raw.method==='codex'&&!state.jobs.some(j=>j.id===result.id)){
    const {message,...job}=result;state.jobs.push(job);
  }
  if(conversationDrafts.get(pid)===raw.text)conversationDrafts.delete(pid);
  if(form.isConnected&&form.elements.text.value===raw.text){form.elements.text.value='';delete form.dataset.dirty;}
  syncConversationFeedback();
  toast(raw.method==='codex'?'Message sent to CoS.':'Message saved locally.');
  try{await refresh(false);request.refreshError=false;}
  catch(error){request.refreshError=true;}
  syncConversationFeedback();
}
