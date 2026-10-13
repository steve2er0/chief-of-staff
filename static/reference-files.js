'use strict';

let referenceDraft = null;

function referenceFilesField() {
  return `<section class="reference-files" aria-labelledby="reference-files-label"><div class="section-title"><label id="reference-files-label" for="project-reference-input">Reference files</label><button type="button" id="choose-reference-files">Choose files…</button></div><input id="project-reference-input" type="file" multiple hidden aria-label="Choose reference files"><small>Choose files from any folder. Saved as read-only copies when you create or save the project. Up to 8 MiB each.</small><div id="selected-reference-files" aria-live="polite"></div></section>`;
}

function referenceSize(size) {
  return size < 1024 ? `${size} B` : size < 1024*1024 ? `${(size/1024).toFixed(1)} KiB` : `${(size/(1024*1024)).toFixed(1)} MiB`;
}

function savedReferencesHTML(project) {
  return (project.reference_files||[]).map(ref=>`<a class="output-link" href="/api/reference/${encodeURIComponent(ref.id)}" download="${esc(ref.name)}">↗ ${esc(ref.name)} <span class="muted">· ${referenceSize(ref.size)} · read-only copy</span></a>`).join('');
}

function initReferenceFiles(form, project) {
  if(referenceDraft && referenceDraft.form!==form)discardReferenceDraft(referenceDraft);
  referenceDraft={form, saved:[...(project.reference_files||[])], pending:[], uploaded:[], saving:false, committed:false};
  renderReferenceFiles();
}

function referenceSaveInProgress() {
  return !!referenceDraft?.saving;
}

function renderReferenceFiles() {
  const draft=referenceDraft;if(!draft||!draft.form.isConnected)return;
  const rows=[...draft.saved.map(ref=>({key:ref.id,name:ref.name,size:ref.size,saved:true})),
    ...draft.pending.map(item=>({key:item.key,name:item.file.name,size:item.file.size,saved:false}))];
  $('#selected-reference-files').innerHTML=rows.map(ref=>`<div class="selected-reference"><div><strong>${esc(ref.name)}</strong><small>${referenceSize(ref.size)} · ${ref.saved?'saved copy':'selected · saved with project'}</small></div><button type="button" class="mini-button" data-remove-reference="${esc(ref.key)}" aria-label="Remove reference ${esc(ref.name)}" ${draft.saving?'disabled':''}>Remove</button></div>`).join('')||'<p class="muted">No reference files selected.</p>';
  $('#choose-reference-files').disabled=draft.saving;
  $('#project-reference-input').disabled=draft.saving;
}

async function prepareReferenceSave(form, pathCount) {
  const draft=referenceDraft;
  if(!draft||draft.form!==form)return [];
  if(pathCount+draft.saved.length+draft.pending.length>30)throw new Error('Keep at most 30 references in total.');
  draft.saving=true;renderReferenceFiles();
  const references=[...draft.saved];
  for(const item of draft.pending){
    if(!item.uploaded){
      const bytes=new Uint8Array(await item.file.arrayBuffer());
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
      const duplicate=references.find(ref=>ref.name===item.file.name&&ref.sha256===hash);
      if(duplicate){item.uploaded=duplicate;continue;}
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      item.uploaded=await api('reference-upload',{filename:item.file.name,base64:btoa(binary)},item.key);
      draft.uploaded.push(item.uploaded.id);
    }
    if(!references.some(ref=>ref.id===item.uploaded.id))references.push(item.uploaded);
  }
  return references.map(ref=>ref.id);
}

function commitReferenceSave(form, savedIds) {
  if(referenceDraft?.form===form){
    const draft=referenceDraft;
    draft.committed=true;draft.saving=false;
    // Removed pending uploads remain unbound; saved snapshots stay for history.
    void discardReferenceDraft({uploaded:draft.uploaded.filter(id=>!savedIds.includes(id))});
  }
}

function finishReferenceSave(form) {
  if(referenceDraft?.form===form){referenceDraft.saving=false;renderReferenceFiles();}
}

async function discardReferenceDraft(draft) {
  if(draft.committed||draft.saving)return;
  for(const id of draft.uploaded){
    try{await api('reference-discard',{id});}catch(error){console.warn('Unsaved reference cleanup: '+error.message);}
  }
}

document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button||button.disabled)return;
  if(button.id==='choose-reference-files')$('#project-reference-input').click();
  if(button.dataset.removeReference&&referenceDraft&&!referenceDraft.saving){
    const draft=referenceDraft,key=button.dataset.removeReference;
    draft.saved=draft.saved.filter(ref=>ref.id!==key);
    draft.pending=draft.pending.filter(item=>item.key!==key);
    markPathFormDirty(draft.form);renderReferenceFiles();
  }
});

document.addEventListener('change',e=>{
  if(e.target.id!=='project-reference-input'||!referenceDraft||referenceDraft.saving)return;
  const draft=referenceDraft,files=Array.from(e.target.files);
  e.target.value='';
  if(files.some(file=>file.size>8*1024*1024)){toast('Choose reference files no larger than 8 MiB each.',true);return;}
  if(lines(draft.form.elements.file_refs.value).length+draft.saved.length+draft.pending.length+files.length>30){toast('Keep at most 30 references in total.',true);return;}
  draft.pending.push(...files.map(file=>({key:crypto.randomUUID(),file})));
  markPathFormDirty(draft.form);renderReferenceFiles();
});

$('#modal').addEventListener('close',()=>{
  if($('#modal').open)return;
  if(referenceDraft){const draft=referenceDraft;referenceDraft=null;void discardReferenceDraft(draft);}
});
