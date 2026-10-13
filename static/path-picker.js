'use strict';

let pathSelection = null, pathSearchTimer;

function pathFields(project) {
  const cwd=project.demo_directory?'':project.cwd||'';
  return `<div class="path-field"><label for="project-cwd">Working directory</label><div class="path-input"><input id="project-cwd" name="cwd" value="${esc(cwd)}" placeholder="Optional now; choose a folder when ready"><button type="button" data-pick-path="directory">Choose folder…</button></div></div>${referenceFilesField()}<details class="working-references"><summary>Files and folders from the working directory</summary><div class="path-field"><label for="project-file-refs">Working-directory references</label><textarea id="project-file-refs" name="file_refs" placeholder="Selected paths appear here, one per line">${esc((project.file_refs||[]).join('\n'))}</textarea><button type="button" data-pick-path="references" ${cwd?'':'disabled'}>Choose files or folders…</button><small id="reference-picker-help">${cwd?'References stay inside the working directory.':'Choose a working directory first.'}</small></div></details>`;
}

function markPathFormDirty(form) {
  form.dataset.dirty='true';
  $('#modal-content').dataset.dirty='true';
}

function syncReferencePicker() {
  const cwd=$('#project-cwd'), button=$('[data-pick-path="references"]');
  if(!cwd||!button)return;
  button.disabled=!cwd.value.trim();
  $('#reference-picker-help').textContent=cwd.value.trim()?'References stay inside the working directory.':'Choose a working directory first.';
}

async function openPathPicker(mode) {
  const form=$('#project-form'), cwd=form.elements.cwd.value.trim();
  if(mode==='references'&&!cwd)throw new Error('Choose a working directory first.');
  const dialog=$('#path-picker');
  pathSelection={mode,form,root:mode==='references'?cwd:'',path:cwd,selected:new Map(),data:null,load:0};
  dialog.innerHTML=`<div class="modal-top"><div><div class="eyebrow">ON THIS COMPUTER</div><h2 id="path-picker-title">${mode==='directory'?'Choose a working folder':'Choose files or folders'}</h2></div><button type="button" id="path-picker-close" aria-label="Close path picker" class="icon-button">×</button></div><form id="path-location-form"><label for="path-location">Folder location</label><div class="path-input"><input id="path-location" value="${esc(cwd)}" placeholder="Browse folders or enter a local path"><button type="submit">Go</button></div></form><div class="picker-navigation"><button type="button" data-picker-home>${mode==='directory'?'Home':'Working directory'}</button><button type="button" data-picker-up disabled>Up one folder</button><label class="picker-hidden"><input type="checkbox" id="path-show-hidden"> Show hidden items</label></div><label for="path-search">Find in this folder</label><input id="path-search" type="search" placeholder="Filter by name"><div id="path-picker-status" role="status" aria-live="polite"></div><div id="path-picker-entries" class="picker-entries"></div><p id="path-picker-note" class="section-note"></p><div class="picker-footer"><span id="path-picker-count" class="muted"></span><div class="actions"><button type="button" id="path-picker-cancel">Cancel</button><button type="button" id="path-picker-apply" class="primary" disabled>${mode==='directory'?'Use this folder':'Add selected references'}</button></div></div>`;
  dialog.showModal();
  await loadPickerPath(cwd);
}

async function loadPickerPath(path) {
  const picker=pathSelection;if(!picker)return;
  const generation=++picker.load;
  $('#path-picker-status').textContent='Loading folder…';
  $('#path-picker-apply').disabled=true;
  try {
    const data=await api('browse',{mode:picker.mode,path,root:picker.root,query:$('#path-search').value,show_hidden:$('#path-show-hidden').checked});
    if(pathSelection!==picker||generation!==picker.load)return;
    picker.data=data;picker.path=data.path;
    $('#path-location').value=data.path;
    $('[data-picker-up]').disabled=!data.parent;
    $('#path-picker-status').textContent='';
    $('#path-picker-entries').innerHTML=data.entries.map(entry=>{
      const title=entry.kind==='directory'?'Folder':entry.kind==='file'?'File':'Link';
      if(!entry.selectable)return `<div class="picker-entry unavailable"><span>${esc(entry.name)}</span><small>${esc(entry.reason)}</small></div>`;
      if(picker.mode==='directory')return `<button type="button" class="picker-folder" data-picker-folder="${esc(entry.path)}"><span>◇</span><strong>${esc(entry.name)}</strong><small>Open folder →</small></button>`;
      return `<div class="picker-entry"><label><input type="checkbox" data-picker-select="${esc(entry.path)}" data-reference="${esc(entry.relative)}" ${picker.selected.has(entry.path)?'checked':''}><span>${esc(entry.name)}</span><small>${title}</small></label>${entry.kind==='directory'?`<button type="button" data-picker-folder="${esc(entry.path)}" class="mini-button" aria-label="Open folder ${esc(entry.name)}">Open →</button>`:''}</div>`;
    }).join('')||'<p class="muted">No matching items in this folder.</p>';
    $('#path-picker-note').textContent=data.truncated?'Showing 300 items. Use Find to narrow the list.':picker.mode==='directory'?data.reason||'Choose this folder, or open a folder below.':'Select files, folders, or both. Folder references do not copy or import their contents.';
    updatePickerChoice();
  }catch(error){
    if(pathSelection!==picker||generation!==picker.load)return;
    picker.data=null;
    $('#path-picker-status').textContent=error.message;
    $('#path-picker-entries').innerHTML='';
  }
}

function updatePickerChoice() {
  const picker=pathSelection;if(!picker)return;
  const count=picker.selected.size;
  $('#path-picker-count').textContent=picker.mode==='references'?`${count} reference${count===1?'':'s'} selected`:'';
  $('#path-picker-apply').disabled=!picker.data||(picker.mode==='directory'?!picker.data.selectable:!count);
}

function closePathPicker() {clearTimeout(pathSearchTimer);$('#path-picker').close();pathSelection=null;}

function applyPickerChoice() {
  const picker=pathSelection;if(!picker?.data)return;
  const form=picker.form;
  if(!form.isConnected){closePathPicker();return;}
  if(picker.mode==='directory') {
    if(!picker.data.selectable)return;
    const changed=form.elements.cwd.value!==picker.data.path;
    form.elements.cwd.value=picker.data.path;
    syncReferencePicker();
    if(changed&&lines(form.elements.file_refs.value).length)$('#reference-picker-help').textContent='Working folder changed. Check the existing references before saving.';
  }else {
    const refs=[...new Set([...lines(form.elements.file_refs.value),...picker.selected.values()])];
    if(refs.length>30)throw new Error('Keep at most 30 file or folder references.');
    form.elements.file_refs.value=refs.join('\n');
  }
  markPathFormDirty(form);closePathPicker();
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try {
    if(button.dataset.pickPath)await openPathPicker(button.dataset.pickPath);
    else if(['path-picker-close','path-picker-cancel'].includes(button.id))closePathPicker();
    else if(button.id==='path-picker-apply')applyPickerChoice();
    else if(button.dataset.pickerFolder){$('#path-search').value='';await loadPickerPath(button.dataset.pickerFolder);}
    else if(button.hasAttribute('data-picker-home')){$('#path-search').value='';await loadPickerPath(pathSelection.mode==='references'?pathSelection.root:'');}
    else if(button.hasAttribute('data-picker-up')){$('#path-search').value='';await loadPickerPath(pathSelection.data.parent);}
  }catch(error){toast(error.message,true);}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='path-location-form')return;
  event.preventDefault();$('#path-search').value='';loadPickerPath($('#path-location').value.trim());
});
document.addEventListener('change',event=>{
  const field=event.target;
  if(field.dataset.pickerSelect){
    if(field.checked)pathSelection.selected.set(field.dataset.pickerSelect,field.dataset.reference);
    else pathSelection.selected.delete(field.dataset.pickerSelect);
    updatePickerChoice();
  }else if(field.id==='path-show-hidden')loadPickerPath(pathSelection.path);
});
document.addEventListener('input',event=>{
  if(event.target.id==='project-cwd')syncReferencePicker();
  if(event.target.id==='path-search'){
    clearTimeout(pathSearchTimer);pathSearchTimer=setTimeout(()=>loadPickerPath(pathSelection?.path||''),250);
  }
});
$('#path-picker').addEventListener('cancel',()=>{clearTimeout(pathSearchTimer);pathSelection=null;});
