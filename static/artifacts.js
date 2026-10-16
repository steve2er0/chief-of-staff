(function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const image=/\.(png|jpe?g|gif|webp)$/i;
  const encoded=value=>encodeURIComponent(String(value));
  function relative(task,value){
    if(typeof value!=='string')return null;
    value=value.trim().replace(/:\d+(?::\d+)?$/,'').replaceAll('\\','/');
    const cwd=String(task.context?.cwd||'').replaceAll('\\','/').replace(/\/$/,'');
    const windows=/^[A-Za-z]:\//.test(cwd),compare=value=>windows?value.toLowerCase():value;
    if(cwd&&compare(value).startsWith(compare(cwd)+'/'))value=value.slice(cwd.length+1);
    if(!value||value.startsWith('/')||value.includes(':')||value.split('/').some(p=>!p||p==='.'||p==='..'))return null;
    return value;
  }
  function references(task,text){
    if(typeof text!=='string')return [];
    const candidates=[...text.matchAll(/\[[^\]\n]*\]\(<?([^\n)>]+)>?\)/g),...text.matchAll(/`([^`\n]+)`/g)].map(m=>m[1]);
    try{const value=JSON.parse(text);if(Array.isArray(value.artifacts))candidates.push(...value.artifacts);}catch{}
    if(task.result&&(task.result.agent_report===text||task.result.summary===text)&&Array.isArray(task.result.artifacts))candidates.push(...task.result.artifacts);
    return [...new Set(candidates.map(path=>relative(task,path)).filter(Boolean))];
  }
  function artifact(task,path){
    const link=(task.output_links||[]).find(link=>relative(task,link.source_path)===path);
    if(link)return {label:path,download:'/api/output/'+encoded(task.id)+'/'+encoded(link.name),preview:'/api/output-preview/'+encoded(task.id)+'/'+encoded(link.name),name:link.name};
    const url='/api/artifact/'+encoded(task.id)+'/'+encoded(path);
    return {label:path,download:url,preview:url+'?preview=1',relative:path};
  }
  function reveal(task,file){
    return `<button type="button" class="text-button artifact-reveal" data-reveal-artifact="${escape(task.id)}" ${file.name!==undefined?`data-artifact-name="${escape(file.name)}"`:`data-artifact-relative="${escape(file.relative)}"`} title="Select this file in the file manager on the computer running CoS">Show in folder</button>`;
  }
  function card(task,file,preview=true){
    return `<figure class="agent-artifact">${preview&&image.test(file.path||file.label)?`<button type="button" class="artifact-preview" data-artifact-enlarge="${escape(file.preview)}" data-artifact-label="${escape(file.label)}" aria-label="Enlarge ${escape(file.label)}"><img src="${escape(file.preview)}" alt="${escape(file.label)}" loading="lazy" decoding="async"><span>Enlarge image</span></button>`:''}<figcaption><a href="${escape(file.download)}" download>${escape(file.label)}</a>${file.partial?'<small class="muted">Partial snapshot</small>':''}${reveal(task,file)}</figcaption></figure>`;
  }
  function render(task,text,options={}){
    if(!task?.id)return '';
    const paths=references(task,text).filter(path=>options.includeFiles!==false||image.test(path));
    return paths.length?`<div class="agent-artifacts">${paths.map(path=>card(task,artifact(task,path))).join('')}</div>`:'';
  }
  function files(task){
    const files=(task.output_links||[]).filter(link=>link.source_path);
    if(!files.length)return '';
    return `<details class="result-files" data-preserve-open="${escape(task.id)}:files" data-panel-detail="files"><summary data-result-focus="${escape(task.id)}:files">Generated files · ${files.length}</summary><div class="agent-artifacts">${files.map(link=>card(task,{label:link.label||link.source_path,path:link.source_path,partial:link.partial,download:'/api/output/'+encoded(task.id)+'/'+encoded(link.name),preview:'/api/output-preview/'+encoded(task.id)+'/'+encoded(link.name),name:link.name})).join('')}</div><p class="section-note">Show in folder opens the file manager on the computer running CoS. Downloads work in this browser.</p></details>`;
  }
  let bound=false,dependencies={};
  function bind(options={}){
    dependencies={...dependencies,...options};
    if(bound||typeof document==='undefined')return;bound=true;
    document.addEventListener('error',event=>{if(event.target.matches?.('.artifact-preview img'))event.target.closest('.artifact-preview').hidden=true;},true);
    document.addEventListener('load',event=>{
      if(!event.target.matches?.('[data-agent-transcript] .artifact-preview img'))return;
      const panel=document.getElementById('agent-panel'),scroll=document.getElementById('agent-conversation-scroll');
      if(panel?.dataset.followLatest==='true'&&panel.dataset.tab==='conversation'&&scroll)scroll.scrollTop=scroll.scrollHeight;
    },true);
    document.addEventListener('click',async event=>{
      const preview=event.target.closest('[data-artifact-enlarge]');
      if(preview){
        event.preventDefault();
        const url=preview.dataset.artifactEnlarge;
        if(!/^\/api\/(?:output-preview|artifact)\//.test(url))return;
        let dialog=document.getElementById('artifact-viewer');
        if(!dialog){dialog=document.createElement('dialog');dialog.id='artifact-viewer';dialog.className='artifact-viewer';document.body.append(dialog);}
        dialog.innerHTML=`<form method="dialog"><button type="submit" class="icon-button" aria-label="Close image">×</button></form><img alt="${escape(preview.dataset.artifactLabel)}" src="${escape(url)}"><p>${escape(preview.dataset.artifactLabel)}</p>`;
        dialog.showModal();
        dialog.addEventListener('close',()=>preview.isConnected&&preview.focus(),{once:true});
        return;
      }
      const button=event.target.closest('[data-reveal-artifact]');
      if(!button||button.disabled)return;
      event.preventDefault();button.disabled=true;
      try{
        const send=dependencies.api||(typeof api==='function'?api:null),notify=dependencies.toast||(typeof toast==='function'?toast:null);
        if(!send)throw new Error('Reconnect to CoS to show this file in its folder.');
        const payload={id:button.dataset.revealArtifact};
        if(button.hasAttribute('data-artifact-name'))payload.name=button.dataset.artifactName;else payload.relative=button.dataset.artifactRelative;
        const result=await send('reveal-artifact',payload,undefined,false);
        if(notify)notify(result.revealed?`Requested selection of ${result.location||'file'} in the app computer’s file manager.`:result.reason,!result.revealed);
      }catch(error){const notify=dependencies.toast||(typeof toast==='function'?toast:null);if(notify)notify(error.message,true);}
      finally{button.disabled=false;}
    });
  }
  const apiObject={render,files,bind,references,relative};
  if(typeof module==='object'&&module.exports)module.exports=apiObject;
  root.AgentArtifacts=apiObject;
  if(typeof document!=='undefined')bind();
})(typeof globalThis!=='undefined'?globalThis:this);
