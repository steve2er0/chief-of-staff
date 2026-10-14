/* Scene projection. Management controls are supplied by the authenticated app. */
(function (root) {
  'use strict';
  function mount(options={}) {
    const isDemo=options.demo===true,isAttention=options.attentionDemo===true;
    const embedded=Boolean(options.host),host=options.host||document.querySelector('main');
    const model=root.LunarLiveModel,layout=model.baseLayout,bound=root.LunarSimulation.bound;
    document.body.dataset.lunarMode='live';
    document.title=isAttention?'Lunar Base · Needs-you demonstration':isDemo?'Lunar Base · Illustrative workshop':'Lunar Base · Agents';
    host.innerHTML=`
      <div class="live-connection"><span id="live-connection" role="status" aria-live="polite">Connecting…</span><span class="demo-label" hidden><b id="live-kind">LIVE AGENTS</b></span><button id="live-refresh" type="button">Refresh</button></div>
      <section class="viewport" aria-label="Live lunar agent map">
        <canvas id="world" width="768" height="512" tabindex="0" aria-label="Live lunar base with habitat, exterior console, lander, model platform, engine test stand and connecting paths. Astronauts represent recorded CLI agents from all projects in one shared base. Drag to pan. Select an astronaut for its conversation; project filters keep the same base. Arrow keys pan; Space pauses illustration."></canvas>
        <div class="scene-title"><p id="live-outpost">SHARED LUNAR BASE</p><h1>LUNAR BASE</h1><div class="title-rule"></div></div>
        <div id="live-empty" class="live-empty" role="status">Waiting for the first supported CoS snapshot.</div>
        <div class="scene-caption" id="live-caption" hidden></div>
      </section>
      <div class="controls"><div class="motion"><button id="pause" type="button" aria-pressed="false">Pause</button><span id="motion-state" hidden></span></div><div class="live-camera"><button id="live-zoom-out" aria-label="Zoom out">−</button><button id="live-zoom-in" aria-label="Zoom in">+</button><button id="live-overview">Home</button><button id="attention-replay" hidden>Replay local attention cycle</button></div></div>
      <nav id="live-projects" class="entities" aria-label="Project filters"></nav>
      <div class="live-crew-heading"><span id="live-crew-heading">Recorded crew</span><div><button id="live-page-prev" aria-label="Previous crew page">←</button><span id="live-crew-page"></span><button id="live-page-next" aria-label="Next crew page">→</button></div></div>
      <nav id="live-workers" class="entities" aria-label="Agents"></nav>
      <section class="details live-details" aria-labelledby="detail-title" ${embedded?'hidden':''}><div><p class="eyebrow" id="detail-kicker">LIVE CONNECTION</p><h2 id="detail-title">Your projects, in place.</h2><p id="detail-body">Select an astronaut to follow its work.</p><div id="live-detail-fields"></div></div><div class="detail-note"><span id="detail-status">Connecting</span><p id="live-source"></p></div></section>
      <p id="attention-announcement" class="attention-summary" role="status" aria-live="polite" hidden></p>
      <details class="scene-info"><summary>Status key</summary><div class="live-legend" aria-label="Agent states">${Object.entries(model.definitions).map(([key,value])=>`<span data-state="${key}"><i></i>${value.label}</span>`).join('')}</div><p id="view-metaphor">Motion illustrates reported activity.</p><b id="view-footer" hidden>LIVE AGENTS</b></details>`;
    if(isDemo) {textSetup();}
    function textSetup(){document.getElementById('view-footer').textContent=isAttention?'SCRIPTED ATTENTION DEMO':'ILLUSTRATIVE WORKSHOP DEMO';document.getElementById('view-metaphor').textContent=isAttention?'Five scripted characters · answers and resolution are in memory only':'Eight scripted characters · no real agent activity';document.getElementById('live-refresh').hidden=true;}
    if(isAttention){elementReplaySetup();}
    function elementReplaySetup(){const button=document.getElementById('attention-replay');button.hidden=false;button.addEventListener('click',()=>{demoElapsed=0;tracks.clear();refresh();});}
    const canvas=host.querySelector('#world'),ctx=canvas.getContext('2d'),images={},tracks=new Map();
    host.querySelectorAll('[data-state]').forEach(label=>{label.querySelector('i').style.backgroundColor=model.definitions[label.dataset.state].colour;});
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const storageKey=isDemo?(isAttention?'cos.lunar.attention-demo.layout.v1':'cos.lunar.workshop-demo.layout.v1'):'cos.lunar.layout.v1';
    let registry,storageAvailable=true;
    try {registry=model.cleanRegistry(JSON.parse(localStorage.getItem(storageKey)||'null'));} catch {registry=model.cleanRegistry(null);}
    let snapshot=null,view={base:{id:'shared-base',x:0,y:0},projects:[],workers:[]},connected=false,lastReceived=0,serverAnchor=0,clientAnchor=0;
    let projectFilter=new URLSearchParams(location.search).get('project')||'',selectedProject=projectFilter,selectedWorker='',fetching=false,requestController=null,connectionError='',initialFocus=false;
    let paused=motion.matches,previous=0,crewPage=0,drag=null,lastPainted=[],listsSignature='',detailSignature='',demoElapsed=0,attentionSignature='',beaconPhase=0;
    let camera={x:0,y:0,zoom:1},assetsReady=false,dirty=true,destroyed=false;
    // Layout and hit testing stay in 768 x 512 logical units. Only the backing
    // surface follows the CSS size and display density, including drawer resize.
    function resizeSurface(){
      const rect=canvas.getBoundingClientRect(),density=window.devicePixelRatio||1;
      const width=Math.max(1,Math.round(rect.width*density)),height=Math.max(1,Math.round(rect.height*density));
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;dirty=true;}
    }
    const resizeObserver=new ResizeObserver(resizeSurface);
    resizeObserver.observe(canvas);window.addEventListener('resize',resizeSurface);resizeSurface();
    const element=id=>host.querySelector('#'+id);
    const text=(id,value)=>{element(id).textContent=value;};
    const date=value=>model.time(value)===null?'Unavailable':new Date(value).toLocaleString();
    function field(label,value,container=element('live-detail-fields')) {
      if (value===undefined || value===null || value==='') return;
      const row=document.createElement('div');row.className='live-field';
      const title=document.createElement('strong');title.textContent=label;
      const content=document.createElement('span');content.textContent=String(value);
      row.append(title,content);container.append(row);
    }
    function logicalNow() {return serverAnchor ? serverAnchor+(Date.now()-clientAnchor) : Date.now();}
    function currentContext() {return {...model.transport(lastReceived,connected,Date.now()),now:logicalNow(),illustrative:isDemo};}
    function persist() {
      try {localStorage.setItem(storageKey,JSON.stringify(registry));}
      catch {storageAvailable=false;}
    }
    function selected() {const worker=view.workers.find(w=>w.key===selectedWorker);return view.projects.find(p=>p.id===(worker?.projectId||selectedProject));}
    function visibleWorkers(){return model.visibleWorkers(view,projectFilter);}
    function pages(){return model.crewPages(view,projectFilter);}
    function reconcile() {
      if (!snapshot) return;
      view=model.build(snapshot,registry,currentContext());
      persist();
      if(projectFilter&&!view.projects.some(p=>p.id===projectFilter)){projectFilter='';selectedProject='';selectedWorker='';options.onFilter?.('');}
      if(selectedProject&&!view.projects.some(p=>p.id===selectedProject))selectedProject='';
      if(!initialFocus){focus();initialFocus=true;}
      if (selectedWorker && !view.workers.some(w=>w.key===selectedWorker)) selectedWorker='';
      for (const worker of view.workers) {
        let track=tracks.get(worker.key);
        const destination=worker.status.area==='workspace' && (isDemo||worker.visual.key!=='console')?worker.position.home:worker.position.work;
        if (!track) {
          // Opening the page never replays a fictitious worker journey.
          const initial=worker.status.animate?destination:worker.position.home;
          track={x:initial.x,y:initial.y,height:0,squash:1,frame:0,journey:null,target:worker.status.area,phase:worker.visual.phase};
          tracks.set(worker.key,track);
        } else if (worker.status.animate && !track.journey && (track.target!==worker.status.area || Math.hypot(track.x-destination.x,track.y-destination.y)>.1)) {
          track.journey={from:{x:track.x,y:track.y},to:destination,elapsed:0};
          track.target=worker.status.area;
        }
        const identity=root.LunarAttention.identity(worker.status.attention);
        if(identity!==track.attentionIdentity){track.attentionIdentity=identity;track.attentionPhase=0;}
        if (!worker.status.animate) {
          track.journey=null;track.height=0;track.squash=1;track.frame=0;
        }
      }
      const requestState=JSON.stringify(view.projects.map(p=>[p.id,p.attentionCount,p.attentionHeld]));
      if(requestState!==attentionSignature){attentionSignature=requestState;const count=view.projects.reduce((n,p)=>n+p.attentionCount,0),held=view.projects.some(p=>p.attentionHeld);text('attention-announcement',count?count+' request'+(count===1?'':'s')+' needs you':held?'Response saved · awaiting agent':'');element('attention-announcement').hidden=!count&&!held;}
      dirty=true; renderLists();renderDetail();renderConnection();
    }
    function focus() {
      const zoom=Math.min(.75,720/layout.width,440/layout.height);
      camera={x:(layout.width-768/zoom)/2,y:-45/zoom,zoom};dirty=true;
    }
    function projectPick(id) {
      if(id&&!view.projects.some(p=>p.id===id))return;
      projectFilter=id;selectedProject=id;selectedWorker='';crewPage=pages()[0];
      dirty=true;renderLists();renderDetail();options.onFilter?.(id);
    }
    function workerPick(key) {
      const worker=view.workers.find(w=>w.key===key);if(!worker)return;
      selectedProject=worker.projectId;selectedWorker=key;crewPage=worker.position.page;
      dirty=true;renderLists();renderDetail();
      if(options.onWorker)options.onWorker(worker);
    }
    function renderLists() {
      const availablePages=pages();if(!availablePages.includes(crewPage))crewPage=availablePages[0];
      const signature=JSON.stringify([projectFilter,selectedWorker,crewPage,view.projects.map(p=>[p.id,p.name,p.workers.length,p.assignments.length,p.attentionCount]),view.workers.map(w=>[w.key,w.name,w.visual.key,w.status.category,w.status.label,w.status.freshness,w.position.page])]);
      if(signature===listsSignature)return;listsSignature=signature;
      const focused=document.activeElement,focusFilter=focused?.id==='live-project-filter',focusWorker=focused?.dataset?.liveWorker;
      const projectList=element('live-projects'),workerList=element('live-workers');
      projectList.replaceChildren();workerList.replaceChildren();
      const label=document.createElement('label');label.className='live-project-filter';label.textContent='Project';
      const select=document.createElement('select');select.id='live-project-filter';select.setAttribute('aria-label','Filter agents by project');
      const all=document.createElement('option');all.value='';all.textContent='All projects';select.append(all);
      for(const p of view.projects){const option=document.createElement('option');option.value=p.id;option.textContent=p.name+(p.attentionCount?' · ? '+p.attentionCount:'');select.append(option);}
      select.value=projectFilter;select.addEventListener('change',()=>projectPick(select.value));label.append(select);projectList.append(label);
      const workers=visibleWorkers(),pageIndex=availablePages.indexOf(crewPage),shown=workers.filter(w=>w.position.page===crewPage).length;
      text('live-crew-heading',workers.length+(isDemo?' scripted character':' agent')+(workers.length===1?'':'s')+(projectFilter?' · '+view.projects.find(p=>p.id===projectFilter).name:' · all projects'));
      text('live-crew-page','Crew '+(pageIndex+1)+' / '+availablePages.length+' · '+shown+' on map');
      element('live-crew-page').parentElement.hidden=availablePages.length<=1;
      element('live-page-prev').disabled=pageIndex===0;
      element('live-page-next').disabled=pageIndex>=availablePages.length-1;
      // The list retains every filtered agent, including other display pages.
      for(const worker of workers) {
        const owner=view.projects.find(p=>p.id===worker.projectId);
        const button=document.createElement('button');button.setAttribute('aria-pressed',String(worker.key===selectedWorker));button.dataset.liveWorker=worker.key;
        button.title=worker.name+' · '+owner.name;
        const dot=document.createElement('i');dot.style.backgroundColor=worker.status.colour;
        const name=document.createElement('span');name.textContent=root.AgentModel.title({title:worker.name});
        const project=document.createElement('small');project.className='live-worker-project';project.textContent=owner.name;name.append(project);
        const status=document.createElement('small');status.textContent=worker.status.label;
        button.append(dot,name,status);button.addEventListener('click',()=>workerPick(worker.key));workerList.append(button);
      }
      if(!workers.length){const note=document.createElement('p');note.className='live-no-workers';note.textContent=projectFilter?'No agents in this project yet. Start one in its folder.':'Your base is ready. Start agents in any project folder.';workerList.append(note);}
      text('live-outpost','Shared lunar base');
      text('live-caption','ONE SHARED BASE · CONNECTING PATHS · '+(isDemo?'SCRIPTED DEMO':view.workers.length+' AGENT'+(view.workers.length===1?'':'S')));
      if(focusFilter)select.focus();
      if(focusWorker)[...workerList.children].find(b=>b.dataset.liveWorker===focusWorker)?.focus();
    }
    function renderConnection() {
      const context=currentContext();
      const message=!snapshot?(connectionError||'Connecting to this CoS service…'):
        !connected?'Disconnected · showing the last snapshot · '+connectionError:
        context.snapshotStale?'Connection stale · motion paused':
        isAttention?'Scripted attention demo · no real workers':isDemo?'Scripted workshop · no real workers':view.fixture?'QA fixtures':snapshot.config?.mode==='simulated'?'Simulated · no model calls':'Connected';
      text('live-connection',message);
      element('live-connection').title=lastReceived?'Last snapshot: '+new Date(lastReceived).toLocaleTimeString():message;
      text('live-kind',isAttention?'SCRIPTED ATTENTION DEMO':isDemo?'ILLUSTRATIVE WORKSHOP DEMO':view.fixture?'QA FIXTURES':snapshot?.config?.mode==='simulated'?'SIMULATED WORKERS':'LIVE AGENTS');
      const empty=element('live-empty');empty.hidden=Boolean(snapshot);
      empty.textContent=!snapshot?(connectionError||'Waiting for the first supported CoS snapshot.'):
        'Your base is ready. Use Start agents to choose a folder and give each agent a task.';
      empty.classList.toggle('connection-error',Boolean(connectionError));
      if (!storageAvailable) text('live-connection',message+' · visual layout storage unavailable');
    }
    function renderDetail() {
      const p=selected(),worker=view.workers.find(w=>w.key===selectedWorker);
      const signature=JSON.stringify([p?.raw,p?.infrastructure,p?.assignments.map(a=>[a.key,a.status.category]),worker?.raw,worker?.visual,worker?.status.category,worker?.status.reason,worker?.status.freshness,selectedProject,selectedWorker,connected]);
      if(signature===detailSignature)return;detailSignature=signature;
      element('live-detail-fields').replaceChildren();
      if (!p) {
        text('detail-kicker','SHARED LUNAR BASE');text('detail-title','All projects, one base');
        text('detail-body','This view reads GET /api/state on this CoS service. It does not discover independent Codex sessions or launch work.');
        text('detail-status',connected?view.workers.length+' recorded agents':'Not connected');
        text('live-source','Source: GET /api/state\nLast snapshot: '+(lastReceived?date(new Date(lastReceived).toISOString()):'Unavailable'));
        return;
      }
      if (worker) {
        const raw=worker.raw,status=worker.status;
        text('detail-kicker',isAttention?'SCRIPTED DEMO ASTRONAUT':worker.kind==='job'?'CoS COORDINATOR CALL':'CoS AGENT ASSIGNMENT');
        text('detail-title',worker.name);text('detail-body',raw.latest_update||raw.result?.summary||raw.progress||'No update text was supplied.');
        text('detail-status',status.label);
        field('Project',p.name);
        if(status.attentionPending){
          field('Attention source',status.attention.source);field('Attention metadata',status.attention.warning);
          for(const item of status.attention.items){
            field(item.kind==='approval'?'Approval decision requested':item.kind==='question'?'Exact question':'Decision requested',item.text);
            if(item.answered)field('Owner response saved',item.owner_answer||item.response_status||'Saved; waiting for explicit agent resolution.');
            if(!isDemo){const link=document.createElement('a');link.className='live-output';link.textContent=item.answered?'Open CoS handoff / continuation controls ↗':item.record_id?'Open existing CoS response controls ↗':'Open CoS task / continuation controls ↗';link.href=root.LunarAttention.target(p.id,worker.id,item);element('live-detail-fields').append(link);}
          }
          field('Response boundary',isDemo?'All questions, answers and resolution in this view are scripted.':'Replies continue with the captured permissions. Tool permissions use the exact request controls in the agent panel.');
        }else if(['needs_input','waiting_for_input'].includes(status.sourceState))field('Request unavailable','The exact request text and type were not supplied.');field('Recorded lifecycle',status.sourceState);field('Agent-reported blocker',status.sourceReported);
        field('Base infrastructure','Habitat, exterior console, lander, model platform and engine test stand');field('Primary work area',p.infrastructure.label);field('Work area choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
        field('Illustrative work pose',worker.visual.label);field('Pose choice',worker.visual.basis);
        field('Illustration boundary',isDemo?'Entirely scripted demo; no worker process or session.':'Pose is a visual metaphor. Current activity is only the reported lifecycle/tool event below.');
        field('What this means',status.reason);field('Last CoS activity',date(status.lastActivity));
        field('Last message / result update',date(status.lastMessage));field('Run started',date(raw.started_at));
        field('Reported tool activity',raw.activity);field('Goal',raw.goal||raw.purpose);
        field('Worker record',raw.id);field('Captured session',raw.session_id);
        if (Array.isArray(raw.criteria)) field('Acceptance criteria',raw.criteria.join('\n'));
        if (raw.result?.next_steps?.length) field('Reported next step',raw.result.next_steps.join('\n'));
        if (worker.kind==='task') for (const output of raw.output_links||[]) {
          const link=document.createElement('a');link.className='live-output';link.textContent=output.label||output.name;
          link.href='/api/output/'+encodeURIComponent(worker.id)+'/'+encodeURIComponent(output.name);link.target='_blank';link.rel='noopener';
          element('live-detail-fields').append(link);
        }
        text('live-source',(isAttention?'Scripted in-memory attention demo':isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixture':'Source: GET /api/state · '+worker.kind+' '+worker.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nMotion illustrates state; work poses are not physical telemetry.');
      } else {
        text('detail-kicker','PROJECT OUTPOST');text('detail-title',p.name);text('detail-body',p.raw.vision||p.raw.goal||'No project description was supplied.');
        text('detail-status',isDemo?'Scripted project':!connected?'Disconnected · last known project':'Recorded project');
        field('Project ID',p.id);
        field('Explicit requests for you',p.attentionCount);
        for(const assignment of p.assignments.filter(a=>a.status.attentionPending)){for(const item of assignment.status.attention.items){field(assignment.raw.title+' · '+item.kind,item.text);if(!isDemo){const link=document.createElement('a');link.className='live-output';link.href=root.LunarAttention.target(p.id,assignment.id,item);link.textContent='Open CoS controls · '+assignment.raw.title+' ↗';element('live-detail-fields').append(link);}}}
        for(const request of p.ownerRequests){field(request.kind==='approval'?'Assignment action requested':'Project '+request.kind,request.text);if(!isDemo){const link=document.createElement('a');link.className='live-output';link.href=request.href;link.textContent='Open existing CoS controls ↗';element('live-detail-fields').append(link);}}field('Project last updated',date(p.raw.updated));field(isDemo?'Scripted characters':'Recorded workers',p.workers.length);
        field('Base infrastructure','Habitat, exterior console, lander, model platform and engine test stand');field('Primary work area',p.infrastructure.label);field('Work area choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
        field('Assignments and CoS calls',p.assignments.length);
        field('Simulated assignments',p.assignments.filter(a=>a.status.simulated).length);
        field('Unconfirmed / not started',p.assignments.filter(a=>!a.status.verified && !a.status.simulated).length);
        for (const assignment of p.assignments.filter(a=>!isDemo && (!a.status.verified || a.status.simulated))) {
          field(assignment.raw.title||'CoS '+(assignment.raw.kind||'call'),(assignment.status.simulated?'Simulated · ':'')+assignment.status.sourceState+' · '+(assignment.raw.latest_update||assignment.raw.progress||assignment.status.reason));
        }
        if(!isDemo) {const link=document.createElement('a');link.className='live-output';link.textContent='Open original CoS project ↗';link.href='/#project/'+encodeURIComponent(p.id);element('live-detail-fields').append(link);}
        text('live-source',(isAttention?'Scripted in-memory attention demo':isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixtures':'Source: GET /api/state · project '+p.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nLocations and work roles are visual metadata only.');
      }
    }
    async function refresh() {
      if(embedded){options.onRefresh?.();return;}
      if (fetching) return;
      fetching=true;requestController=new AbortController();
      const timeout=setTimeout(()=>requestController.abort(),8000);
      try {
        if(isDemo) {snapshot=root.LunarWorkshop.snapshot(demoElapsed);if(isAttention)snapshot=root.LunarAttentionDemo.snapshot(demoElapsed);connected=true;lastReceived=clientAnchor=Date.now();serverAnchor=lastReceived;reconcile();return;}
        const response=await fetch('/api/state',{method:'GET',credentials:'same-origin',cache:'no-store',signal:requestController.signal});
        if (!response.ok) {
          throw new Error(response.status===401?'Open the private CoS launch URL, then use Reconnect / refresh.':response.status===404?'This page must be opened from Chief of Staff for live data.':'CoS returned HTTP '+response.status+'.');
        }
        const data=await response.json();
        // Validate before replacing last-known data.
        model.build(data,model.cleanRegistry(registry),{now:Date.now(),connected:true});
        snapshot=data;connected=true;connectionError='';lastReceived=clientAnchor=Date.now();serverAnchor=model.time(data.local_time)||lastReceived;
        reconcile();
      } catch(error) {
        connected=false;connectionError=error.name==='AbortError'?'The CoS service timed out.':error.message;
        if(snapshot)reconcile();else renderConnection();
      } finally {clearTimeout(timeout);fetching=false;requestController=null;}
    }
    function screen(point) {return {x:(point.x-camera.x)*camera.zoom,y:(point.y-camera.y)*camera.zoom};}
    function world(point) {return {x:point.x/camera.zoom+camera.x,y:point.y/camera.zoom+camera.y};}
    function ring(point,width,colour) {
      ctx.strokeStyle=colour;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(point.x,point.y,width,width*.25,0,0,Math.PI*2);ctx.stroke();
    }
    function packed(name,x,y,width,height) {
      const region=root.LunarDisplayAssets.regions[name];
      ctx.drawImage(images.teal,region.x,region.y,region.width,region.height,x,y,width,height);
    }
    function crewFrame(sprite,name,col,row,cellWidth=64){
      const region=root.LunarDisplayAssets.regions[name],scale=region.scale;
      ctx.drawImage(sprite,region.x+col*cellWidth*scale,region.y+row*64*scale,cellWidth*scale,64*scale,-32,-58,cellWidth,64);
    }
    function draw() {
      if(!assetsReady)return;
      ctx.setTransform(canvas.width/768,0,0,canvas.height/512,0,0);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(images.terrain,0,0,768,512);
      // A restrained ground tint keeps the crew and warm-lit props prominent.
      const ground=ctx.createLinearGradient(0,105,0,512);ground.addColorStop(0,'#0b122000');ground.addColorStop(1,'#0b122030');ctx.fillStyle=ground;ctx.fillRect(0,0,768,512);
      lastPainted=[];const drawables=[],beacons=[];
      const filteredProjects=projectFilter?view.projects.filter(p=>p.id===projectFilter):view.projects;
      const base={...view.base,workers:visibleWorkers(),attentionCount:filteredProjects.reduce((n,p)=>n+p.attentionCount,0),attentionHeld:filteredProjects.some(p=>p.attentionHeld)};
      for (const p of [base]) {
        const corner=screen(p);
        if(corner.x+layout.width*camera.zoom < -100||corner.x>868||corner.y+layout.height*camera.zoom < -100||corner.y>612)continue;
        if(p.attentionCount||p.attentionHeld)beacons.push({p,point:screen({x:p.x+341,y:p.y+120})});
        for(const path of layout.paths) {
          ctx.beginPath();path.forEach(([x,y],i)=>{const point=screen({x:p.x+x,y:p.y+y});i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y);});
          ctx.strokeStyle='#111f364d';ctx.lineWidth=12*camera.zoom;ctx.setLineDash([]);ctx.stroke();
          ctx.strokeStyle='#91dadddd';ctx.lineWidth=Math.max(1.3,2*camera.zoom);ctx.setLineDash([5*camera.zoom,7*camera.zoom]);ctx.stroke();
        }
        ctx.setLineDash([]);
        for(const object of layout.objects) {
          const s=screen({x:p.x+object.x,y:p.y+object.y}),w=object.width*camera.zoom,h=object.height*camera.zoom;
          drawables.push({depth:p.y+object.y+object.height,draw:()=>{
            ctx.fillStyle='#1a1d3d44';ctx.beginPath();ctx.ellipse(s.x+w/2,s.y+h-3*camera.zoom,w*.39,9*camera.zoom,0,0,Math.PI*2);ctx.fill();
            if(object.asset==='habitat'||object.asset==='console')ctx.drawImage(images[object.asset],s.x,s.y,w,h);
            else packed(object.asset,s.x,s.y,w,h);

          }});
          lastPainted.push({kind:'base',id:p.id,x:s.x,y:s.y,width:w,height:h,depth:p.y+object.y+object.height});
        }
      }
      for(const worker of visibleWorkers()) {
        if(worker.position.page!==crewPage)continue;
        const track=tracks.get(worker.key);if(!track)continue;
        const position=screen(track),scale=camera.zoom;
        if(position.x < -80||position.x>848||position.y < -80||position.y>592)continue;
        const owner=view.projects.find(p=>p.id===worker.projectId);
        drawables.push({depth:track.y,draw:()=>{
          ctx.fillStyle='rgba(23,25,55,'+(.30-track.height*.008)+')';ctx.beginPath();
          ctx.ellipse(position.x-6*scale,position.y,(13-track.height*.16)*scale,3*scale,0,0,Math.PI*2);ctx.fill();
          if(worker.key===selectedWorker)ring(position,16*scale,worker.status.colour);
          const attending=worker.status.attentionPending;
          const moving=worker.status.animate && track.journey,working=worker.status.animate && !track.journey && (!isDemo||worker.status.area==='console');
          const row=moving?0:working?2:1,frame=moving?track.frame:working?Math.floor(track.phase*5)%6:0;
          const landmark=layout.objects.find(o=>o.id===worker.position.area);
          const center=owner.x+(landmark?landmark.x+landmark.width/2:layout.width/2);
          const role=model.roles[worker.visual.key],workFlip=working && worker.visual.key!=='console' && track.x>center;
          ctx.save();ctx.translate(position.x,position.y-track.height*scale);ctx.scale(scale*(attending?1:working?(workFlip?-1:1):(track.flip?-1:1)),scale*track.squash);
          if(!worker.status.animate && !attending)ctx.globalAlpha=.80;
          const sprite=worker.slot%2?images.amber:images.teal;
          if(attending){
            const pose=root.LunarAttention.phase(track.attentionPhase||0,!paused&&worker.status.attentionAnimate);
            crewFrame(sprite,'attention',pose.frame,pose.row);
          } else if(working && role.row!==null) {
            const workFrame=Math.floor(track.phase*role.rate)%4;
            crewFrame(sprite,'work',workFrame,role.row,96);
          } else crewFrame(sprite,'crew',frame,row);
          ctx.restore();
          if(attending){const radius=Math.max(7,10*scale),y=position.y-68*scale;ctx.fillStyle='#ffbd66';ctx.beginPath();ctx.arc(position.x,y,radius,0,Math.PI*2);ctx.fill();ctx.fillStyle='#25303c';ctx.font='bold '+Math.round(radius*1.65)+'px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(worker.status.attention.items.every(i=>i.answered)?'·':'?',position.x,y+radius*.58);ctx.textAlign='left';}
          ctx.fillStyle=worker.status.attentionPending?'#ffbd66':worker.status.colour;ctx.fillRect(position.x-3,position.y+7*scale,6,3);
          const projectLabel=owner.name.length>22?owner.name.slice(0,21)+'…':owner.name;ctx.font='9px system-ui, sans-serif';
          const labelWidth=ctx.measureText(projectLabel).width+8;ctx.fillStyle='#0b1220de';ctx.fillRect(position.x-labelWidth/2,position.y+12,labelWidth,14);
          ctx.fillStyle='#c9d7e8';ctx.textAlign='center';ctx.fillText(projectLabel,position.x,position.y+22);ctx.textAlign='left';
        }});
        lastPainted.push({kind:'worker',id:worker.key,x:position.x-25*scale,y:position.y-(track.height+54)*scale,width:50*scale,height:60*scale,depth:track.y});
      }
      drawables.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
      for(const {p,point} of beacons){
        const animated=!paused&&connected&&!currentContext().snapshotStale&&p.workers.some(w=>w.status.attentionAnimate),radius=10+(animated?Math.sin(beaconPhase*2)*2:0);
        ctx.fillStyle='#ffbd662d';ctx.beginPath();ctx.arc(point.x,point.y,radius+7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffbd66';ctx.beginPath();ctx.arc(point.x,point.y,Math.max(7,8*camera.zoom),0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#222b35';ctx.font='bold 12px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(p.attentionCount?'?':'·',point.x,point.y+4);ctx.textAlign='left';
        if(p.attentionCount){ctx.fillStyle='#201f34';ctx.fillRect(point.x+13,point.y-8,16,16);ctx.fillStyle='#ffce8b';ctx.fillText(String(p.attentionCount),point.x+17,point.y+4);}
        lastPainted.push({kind:'base',id:p.id,x:point.x-18,y:point.y-18,width:48,height:36,depth:1e6});
      }
    }
    function updateMotion() {
      element('pause').textContent=paused?'Resume':'Pause';
      element('pause').setAttribute('aria-label',paused?'Resume illustration':'Pause illustration');
      element('pause').title='Animation illustrates fresh reported activity';
      element('pause').setAttribute('aria-pressed',String(paused));
      text('motion-state',paused?(motion.matches?'Paused · reduced motion':'Illustration paused'):isDemo?'Scripted work poses and gentle lunar bounds':'Fresh reported activity enables illustrative poses');
    }
    function loop(timestamp) {
      if(destroyed)return;
      const elapsed=previous?Math.min(.08,(timestamp-previous)/1000):0;previous=timestamp;
      if(!paused && !document.hidden) {
        if(isDemo)demoElapsed+=elapsed;beaconPhase+=elapsed;
        for(const worker of view.workers) {
          const status=model.classify(worker.raw,{...currentContext(),kind:worker.kind}),track=tracks.get(worker.key);
          if(!track)continue;
          if(status.attentionAnimate)track.attentionPhase=(track.attentionPhase||0)+elapsed;
          if(!status.animate)continue;
          track.phase+=elapsed;
          if(track.journey) {
            track.journey.elapsed+=elapsed;
            const pose=model.pose(track.journey.elapsed,track.journey.from,track.journey.to,bound);
            Object.assign(track,pose);if(pose.done)track.journey=null;
          }
        }
      }
      if(assetsReady && (dirty || drag || (!paused && view.workers.some(w=>w.status.animate||w.status.attentionAnimate)))) {draw();dirty=false;}
      requestAnimationFrame(loop);
    }
    function zoom(factor) {
      const center=world({x:384,y:300}),next=Math.max(.18,Math.min(1.5,camera.zoom*factor));
      camera={x:center.x-384/next,y:center.y-300/next,zoom:next};dirty=true;
    }
    function overview(){focus();renderLists();}
    element('pause').addEventListener('click',()=>{paused=!paused;dirty=true;updateMotion();});
    motion.addEventListener('change',event=>{if(event.matches){paused=true;dirty=true;updateMotion();}});
    element('live-refresh').addEventListener('click',refresh);
    element('live-zoom-in').addEventListener('click',()=>zoom(1.25));
    element('live-zoom-out').addEventListener('click',()=>zoom(.8));
    element('live-overview').addEventListener('click',overview);
    element('live-page-prev').addEventListener('click',()=>{const available=pages();crewPage=available[Math.max(0,available.indexOf(crewPage)-1)];selectedWorker='';dirty=true;renderLists();renderDetail();});
    element('live-page-next').addEventListener('click',()=>{const available=pages();crewPage=available[Math.min(available.length-1,available.indexOf(crewPage)+1)];selectedWorker='';dirty=true;renderLists();renderDetail();});
    canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,camera:{...camera},moved:false};});
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;const rect=canvas.getBoundingClientRect(),dx=(event.clientX-drag.x)*768/rect.width,dy=(event.clientY-drag.y)*512/rect.height;
      if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
      if(drag.moved){camera={...camera,x:drag.camera.x-dx/camera.zoom,y:drag.camera.y-dy/camera.zoom};}
    });
    canvas.addEventListener('pointerup',event=>{
      if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;
      const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*768/rect.width,y=(event.clientY-rect.top)*512/rect.height;
      const hit=[...lastPainted].sort((a,b)=>b.depth-a.depth).find(item=>x>=item.x&&x<=item.x+item.width&&y>=item.y&&y<=item.y+item.height);
      if(hit){if(hit.kind==='worker')workerPick(hit.id);else{selectedWorker='';selectedProject=projectFilter;dirty=true;renderLists();renderDetail();}}
    });
    canvas.addEventListener('pointercancel',()=>{drag=null;});
    canvas.addEventListener('keydown',event=>{
      if(event.code==='Space'){event.preventDefault();paused=!paused;dirty=true;updateMotion();}
      const delta={ArrowLeft:[-50,0],ArrowRight:[50,0],ArrowUp:[0,-50],ArrowDown:[0,50]}[event.key];
      if(delta){event.preventDefault();camera.x+=delta[0]/camera.zoom;camera.y+=delta[1]/camera.zoom;dirty=true;}
    });
    const visibility=()=>{previous=0;if(!document.hidden)refresh();};
    document.addEventListener('visibilitychange',visibility);
    const pagehide=()=>requestController?.abort();
    window.addEventListener('pagehide',pagehide,{once:true});
    updateMotion();renderConnection();
    Promise.all(Object.entries({terrain:'terrain',habitat:'habitat',console:'console',teal:'astronaut-teal',amber:'astronaut-amber'}).map(([key,name])=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{images[key]=image;resolve();};image.onerror=()=>reject(new Error('Scene asset unavailable: '+name));image.src='/lunar-base/assets/'+name+'.png';
    }))).then(()=>{if(destroyed)return;assetsReady=true;requestAnimationFrame(loop);}).catch(error=>{if(destroyed)return;connectionError=error.message;renderConnection();});
    if(!embedded)refresh();
    const polling=embedded?null:setInterval(()=>{if(!document.hidden && (!isDemo||!paused))refresh();},isAttention?500:2500);
    const aging=setInterval(()=>{if(snapshot&&!document.hidden)reconcile();},1000);
    return {
      update(data){if(destroyed)return;model.build(data,model.cleanRegistry(registry),{now:Date.now(),connected:true});snapshot=data;connected=true;connectionError='';lastReceived=clientAnchor=Date.now();serverAnchor=model.time(data.local_time)||lastReceived;reconcile();},
      disconnect(message){connected=false;connectionError=message;if(snapshot)reconcile();else renderConnection();},
      selectAgent(id){const worker=view.workers.find(w=>w.agentId===id);if(worker&&selectedWorker!==worker.key){if(projectFilter&&worker.projectId!==projectFilter){projectFilter='';options.onFilter?.('');}selectedProject=worker.projectId;selectedWorker=worker.key;crewPage=worker.position.page;dirty=true;renderLists();renderDetail();}},
      selectProject(id){if(projectFilter!==id&&(!id||view.projects.some(p=>p.id===id)))projectPick(id);},
      destroy(){destroyed=true;resizeObserver.disconnect();window.removeEventListener('resize',resizeSurface);clearInterval(polling);clearInterval(aging);requestController?.abort();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);}
    };
  }
  root.LunarLiveView={mount};
})(typeof window !== 'undefined'?window:globalThis);
