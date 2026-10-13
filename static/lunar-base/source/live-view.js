/* GET-only CoS scene. Visual metadata stays in this browser, outside CoS records. */
(function (root) {
  'use strict';
  function mount(options={}) {
    const isDemo=options.demo===true;
    const model=root.LunarLiveModel, bound=root.LunarSimulation.bound;
    document.body.dataset.lunarMode='live';
    document.title=isDemo?'Lunar Base · Illustrative workshop':'Lunar Base · Read-only CoS view';
    document.querySelector('main').innerHTML=`
      <header class="masthead"><a class="back" href="/">← Chief of Staff</a><span class="demo-label"><span></span><b id="live-kind">READ-ONLY CoS VIEW</b></span></header>
      <div class="live-connection"><span id="live-connection" role="status" aria-live="polite">Connecting to this CoS service…</span><button id="live-refresh" type="button">Reconnect / refresh</button><a href="?mode=placement">All infrastructure ↗</a><a href="?mode=workshop">Work types demo ↗</a><a href="?mode=demo">Original demo ↗</a><a id="live-route" href="?mode=live">Read-only live view ↗</a></div>
      <section class="viewport" aria-label="Read-only lunar project map">
        <canvas id="world" width="768" height="512" tabindex="0" aria-label="Read-only lunar map of CoS projects and recorded workers. Drag to pan. Select a building or crew member, or use the lists below. Arrow keys pan; Space pauses illustration."></canvas>
        <div class="scene-title"><p id="live-outpost">YOUR PROJECT OUTPOSTS</p><h1>LUNAR BASE</h1><div class="title-rule"></div></div>
        <div id="live-empty" class="live-empty" role="status">Waiting for the first supported CoS snapshot.</div>
        <div class="scene-caption" id="live-caption">CoS PROJECTS · RECORDED WORKERS</div>
      </section>
      <div class="controls"><div class="motion"><button id="pause" type="button" aria-pressed="false">Pause illustration</button><span id="motion-state">Only fresh reported activity animates</span></div><div class="live-camera"><button id="live-zoom-out" aria-label="Zoom out">−</button><button id="live-zoom-in" aria-label="Zoom in">+</button><button id="live-overview">All outposts</button></div></div>
      <nav id="live-projects" class="entities" aria-label="Project outposts"></nav>
      <div class="live-crew-heading"><span id="live-crew-heading">Recorded crew</span><div><button id="live-page-prev" aria-label="Previous crew page">←</button><span id="live-crew-page"></span><button id="live-page-next" aria-label="Next crew page">→</button></div></div>
      <nav id="live-workers" class="entities" aria-label="Recorded workers"></nav>
      <section class="details live-details" aria-labelledby="detail-title"><div><p class="eyebrow" id="detail-kicker">READ-ONLY CONNECTION</p><h2 id="detail-title">Your projects, in place.</h2><p id="detail-body">This view reads this CoS service. It does not discover independent Codex sessions or launch work.</p><div id="live-detail-fields"></div></div><div class="detail-note"><span id="detail-status">Connecting</span><p id="live-source"></p></div></section>
      <div class="live-legend" aria-label="Worker states"><span>Running</span><span>Waiting</span><span>Blocked / failed</span><span>Needs review</span><span>Completed</span><span>Unknown / stale</span></div>
      <footer><b id="view-footer">READ-ONLY CoS VIEW</b><span id="view-metaphor">Task roles are illustrations · no physical activity or token telemetry</span></footer>`;
    if(isDemo) {textSetup();}
    function textSetup(){document.getElementById('view-footer').textContent='ILLUSTRATIVE WORKSHOP DEMO';document.getElementById('view-metaphor').textContent='Eight scripted characters · no real agent activity';document.getElementById('live-refresh').hidden=true;}
    const canvas=document.querySelector('#world'),ctx=canvas.getContext('2d'),images={},tracks=new Map();
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const storageKey=isDemo?'cos.lunar.workshop-demo.layout.v1':'cos.lunar.layout.v1';
    let registry,storageAvailable=true;
    try {registry=model.cleanRegistry(JSON.parse(localStorage.getItem(storageKey)||'null'));} catch {registry=model.cleanRegistry(null);}
    let snapshot=null,view={projects:[],workers:[]},connected=false,lastReceived=0,serverAnchor=0,clientAnchor=0;
    let selectedProject=new URLSearchParams(location.search).get('project')||'',selectedWorker='',fetching=false,requestController=null,connectionError='',initialFocus=false;
    let paused=motion.matches,previous=0,crewPage=0,drag=null,lastPainted=[],listsSignature='',detailSignature='',demoElapsed=0;
    let camera={x:0,y:0,zoom:1},assetsReady=false,dirty=true,projectFocus=true;
    const element=id=>document.getElementById(id);
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
    function selected() {return view.projects.find(p=>p.id===selectedProject);}
    function reconcile() {
      if (!snapshot) return;
      view=model.build(snapshot,registry,currentContext());
      persist();
      if (!view.projects.some(p=>p.id===selectedProject)) {
        selectedProject=view.projects[0]?.id||'';selectedWorker='';crewPage=0;
        if (selectedProject) focus(selected());
      }
      if(!initialFocus && selectedProject) {focus(selected());initialFocus=true;}
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
        if (!worker.status.animate) {
          track.journey=null;track.height=0;track.squash=1;track.frame=0;
        }
      }
      dirty=true; renderLists();renderDetail();renderConnection();
    }
    function focus(project) {
      if (!project) return;
      camera={x:project.x-150,y:project.y+5,zoom:.72};
      projectFocus=true;
      dirty=true;
    }
    function projectPick(id) {
      selectedProject=id;selectedWorker='';crewPage=0;
      const p=selected();
      const active=p.workers.find(w=>w.status.animate);
      if (active) crewPage=active.position.page;
      focus(p);renderLists();renderDetail();
    }
    function workerPick(key) {
      const worker=view.workers.find(w=>w.key===key);if(!worker)return;
      selectedProject=worker.projectId;selectedWorker=key;crewPage=worker.position.page;
      focus(selected());renderLists();renderDetail();
    }
    function renderLists() {
      const signature=JSON.stringify([selectedProject,selectedWorker,crewPage,view.projects.map(p=>[p.id,p.name,p.infrastructure.type,p.workers.length,p.assignments.length]),view.workers.map(w=>[w.key,w.name,w.visual.key,w.status.category,w.position.page])]);
      if(signature===listsSignature)return;listsSignature=signature;
      const focused=document.activeElement?.dataset;
      const focusProject=focused?.liveProject,focusWorker=focused?.liveWorker;
      const projectList=element('live-projects'),workerList=element('live-workers');
      projectList.replaceChildren();workerList.replaceChildren();
      for (const p of view.projects) {
        const button=document.createElement('button');button.textContent=p.name;
        button.setAttribute('aria-pressed',String(p.id===selectedProject));button.dataset.liveProject=p.id;
        button.addEventListener('click',()=>projectPick(p.id));projectList.append(button);
      }
      const p=selected(),workers=p?.workers||[];
      const pageCount=workers.length?Math.max(...workers.map(w=>w.position.page))+1:1;
      crewPage=Math.min(crewPage,pageCount-1);
      text('live-crew-heading',workers.length+(isDemo?' scripted character':' recorded worker')+(workers.length===1?'':'s')+(p?' · '+p.name:''));
      text('live-crew-page','Crew page '+(crewPage+1)+' / '+pageCount);
      element('live-page-prev').disabled=crewPage===0;
      element('live-page-next').disabled=crewPage>=pageCount-1;
      for (const worker of workers.filter(w=>w.position.page===crewPage)) {
        const button=document.createElement('button');button.setAttribute('aria-pressed',String(worker.key===selectedWorker));
        button.dataset.liveWorker=worker.key;
        const dot=document.createElement('i');dot.style.backgroundColor=worker.status.colour;
        const label=document.createElement('span');label.textContent=worker.name;
        const status=document.createElement('small');status.textContent=worker.status.label;
        button.append(dot,label,status);button.addEventListener('click',()=>workerPick(worker.key));workerList.append(button);
      }
      if (p && !workers.length) {
        const note=document.createElement('p');note.className='live-no-workers';
        note.textContent=p.assignments.length?'No confirmed real worker run in these records. Queued, simulated and unverified assignments remain in project details.':'No recorded workers for this project.';
        workerList.append(note);
      }
      text('live-outpost',p?p.name.toUpperCase():'YOUR PROJECT OUTPOSTS');
      text('live-caption',(p?.infrastructure.label.toUpperCase()||'PROJECT OUTPOSTS')+' · '+(isDemo?'SCRIPTED DEMO':view.workers.length+' RECORDED WORKERS'));
      if(focusProject)[...projectList.children].find(b=>b.dataset.liveProject===focusProject)?.focus();
      if(focusWorker)[...workerList.children].find(b=>b.dataset.liveWorker===focusWorker)?.focus();
    }
    function renderConnection() {
      const context=currentContext();
      const message=!snapshot?(connectionError||'Connecting to this CoS service…'):
        !connected?'Disconnected · showing the last snapshot · '+connectionError:
        context.snapshotStale?'Snapshot stale · motion held':
        isDemo?'Scripted workshop · eight illustrative characters · no real workers':view.fixture?'QA fixtures connected · no real workers started':'Connected to this CoS service · read-only';
      text('live-connection',message+(lastReceived?' · snapshot '+new Date(lastReceived).toLocaleTimeString():''));
      text('live-kind',isDemo?'ILLUSTRATIVE WORKSHOP DEMO':view.fixture?'READ-ONLY · QA FIXTURES':'READ-ONLY CoS VIEW');
      const empty=element('live-empty');empty.hidden=Boolean(snapshot && view.projects.length);
      empty.textContent=!snapshot?(connectionError||'Waiting for the first supported CoS snapshot.'):
        'No CoS projects yet. Create or open projects in Chief of Staff, then return here.';
      empty.classList.toggle('connection-error',Boolean(connectionError));
      if (!storageAvailable) text('live-connection',message+' · visual layout storage unavailable');
    }
    function renderDetail() {
      const p=selected(),worker=view.workers.find(w=>w.key===selectedWorker);
      const signature=JSON.stringify([p?.raw,p?.infrastructure,p?.assignments.map(a=>[a.key,a.status.category]),worker?.raw,worker?.visual,worker?.status.category,selectedProject,selectedWorker,connected]);
      if(signature===detailSignature)return;detailSignature=signature;
      element('live-detail-fields').replaceChildren();
      if (!p) {
        text('detail-kicker','READ-ONLY CONNECTION');text('detail-title',snapshot?'No project records':'Your projects, in place.');
        text('detail-body','This view reads GET /api/state on this CoS service. It does not discover independent Codex sessions or launch work.');
        text('detail-status',connected?'No projects':'Not connected');
        text('live-source','Source: GET /api/state\nLast snapshot: '+(lastReceived?date(new Date(lastReceived).toISOString()):'Unavailable'));
        return;
      }
      if (worker) {
        const raw=worker.raw,status=worker.status;
        text('detail-kicker',worker.kind==='job'?'CoS COORDINATOR CALL':'CoS AGENT ASSIGNMENT');
        text('detail-title',worker.name);text('detail-body',raw.latest_update||raw.result?.summary||raw.progress||'No update text was supplied.');
        text('detail-status',status.label);
        field('Project',p.name);field('Recorded lifecycle',status.sourceState);field('Agent-reported blocker',status.sourceReported);
        field('Shared infrastructure',p.infrastructure.label);field('Infrastructure choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
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
        text('live-source',(isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixture':'Source: GET /api/state · '+worker.kind+' '+worker.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nMotion illustrates state; work poses are not physical telemetry.');
      } else {
        text('detail-kicker','PROJECT OUTPOST');text('detail-title',p.name);text('detail-body',p.raw.vision||p.raw.goal||'No project description was supplied.');
        text('detail-status',isDemo?'Scripted outpost':!connected?'Disconnected · last known project':'Recorded project');
        field('Project ID',p.id);field('Project last updated',date(p.raw.updated));field(isDemo?'Scripted characters':'Recorded workers',p.workers.length);
        field('Shared infrastructure',p.infrastructure.label);field('Infrastructure choice',p.infrastructure.basis+(p.infrastructure.matched?' · '+p.infrastructure.matched:''));
        field('Assignments and CoS calls',p.assignments.length);
        field('Simulated assignments',p.assignments.filter(a=>a.status.simulated).length);
        field('Unconfirmed / not started',p.assignments.filter(a=>!a.status.verified && !a.status.simulated).length);
        for (const assignment of p.assignments.filter(a=>!isDemo && (!a.status.verified || a.status.simulated))) {
          field(assignment.raw.title||'CoS '+(assignment.raw.kind||'call'),(assignment.status.simulated?'Simulated · ':'')+assignment.status.sourceState+' · '+(assignment.raw.latest_update||assignment.raw.progress||assignment.status.reason));
        }
        if(!isDemo) {const link=document.createElement('a');link.className='live-output';link.textContent='Open original CoS project ↗';link.href='/#project/'+encodeURIComponent(p.id);element('live-detail-fields').append(link);}
        text('live-source',(isDemo?'Scripted in-memory workshop demo':view.fixture?'Synthetic QA fixtures':'Source: GET /api/state · project '+p.id)+'\nLast snapshot received: '+date(new Date(lastReceived).toISOString())+'\nLocations and work roles are visual metadata only.');
      }
    }
    async function refresh() {
      if (fetching) return;
      fetching=true;requestController=new AbortController();
      const timeout=setTimeout(()=>requestController.abort(),8000);
      try {
        if(isDemo) {snapshot=root.LunarWorkshop.snapshot(demoElapsed);connected=true;lastReceived=clientAnchor=Date.now();serverAnchor=lastReceived;reconcile();return;}
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
      const region=root.LunarWorkshopAssets.regions[name];
      ctx.drawImage(images.teal,region.x,region.y,region.width,region.height,x,y,width,height);
    }
    function draw() {
      if(!assetsReady)return;
      ctx.imageSmoothingEnabled=false;ctx.drawImage(images.terrain,0,0,768,512);
      lastPainted=[];const drawables=[];
      for (const p of view.projects) {
        if(projectFocus && p.id!==selectedProject)continue;
        const misc=p.infrastructure.type==='miscellaneous';
        const building=misc?{x:p.x+191,y:p.y+100,width:410,height:255}:{x:p.x+235,y:p.y+65,width:310,height:193};
        const s=screen(building),w=building.width*camera.zoom,h=building.height*camera.zoom;
        if(s.x+w < -100||s.x>868||s.y+h < -100||s.y>612)continue;
        drawables.push({depth:building.y+building.height,draw:()=>{
          ctx.fillStyle='#1a1d3d55';ctx.beginPath();ctx.ellipse(s.x+w*.45,s.y+h-10*camera.zoom,w*.37,w*.06,0,0,Math.PI*2);ctx.fill();
          ctx.drawImage(images.habitat,s.x,s.y,w,h);
          if(p.id===selectedProject)ring({x:s.x+w*.45,y:s.y+h},w*.38,'#75dfe4');
          ctx.font=Math.max(8,11*camera.zoom)+'px ui-monospace, monospace';
          const label=p.name.length>38?p.name.slice(0,37)+'…':p.name;
          const width=ctx.measureText(label).width+16;
          const labelY=misc?Math.max(12,s.y-22):s.y+h+8;
          ctx.fillStyle='#0b1422e6';ctx.fillRect(s.x,labelY,width,20);
          ctx.fillStyle='#e8e4df';ctx.fillText(label,s.x+8,labelY+14);
        }});
        lastPainted.push({kind:'project',id:p.id,x:s.x,y:s.y,width:w,height:h,depth:building.y+building.height});
        if(!misc) {
          const region=root.LunarWorkshopAssets.regions[p.infrastructure.asset];
          const point=screen({x:p.x+384-region.width/2,y:p.y+500-region.height});
          drawables.push({depth:p.y+500,draw:()=>{
            ctx.fillStyle='#1a1d3d44';ctx.beginPath();ctx.ellipse(point.x+region.width*camera.zoom/2,point.y+region.height*camera.zoom,region.width*.42*camera.zoom,9*camera.zoom,0,0,Math.PI*2);ctx.fill();
            packed(p.infrastructure.asset,point.x,point.y,region.width*camera.zoom,region.height*camera.zoom);
          }});
          lastPainted.push({kind:'project',id:p.id,x:point.x,y:point.y,width:region.width*camera.zoom,height:region.height*camera.zoom,depth:p.y+500});
        } else {
          // The original exterior console stays next to the habitat.
          const consolePoint=screen({x:p.x+139,y:p.y+298});
          drawables.push({depth:p.y+393,draw:()=>ctx.drawImage(images.console,consolePoint.x,consolePoint.y,86*camera.zoom,95*camera.zoom)});
        }
      }
      for(const worker of view.workers) {
        if(projectFocus && worker.projectId!==selectedProject)continue;
        const visiblePage=worker.projectId===selectedProject?crewPage:0;
        if(worker.position.page!==visiblePage)continue;
        const track=tracks.get(worker.key);if(!track)continue;
        const work=screen(worker.position.work),position=screen(track),scale=camera.zoom;
        if(position.x < -80||position.x>848||position.y < -80||position.y>592)continue;
        const owner=view.projects.find(p=>p.id===worker.projectId);
        if(worker.visual.key==='console' && !(owner.infrastructure.type==='miscellaneous' && worker.position.station===0)) {
          drawables.push({depth:worker.position.work.y-7,draw:()=>ctx.drawImage(images.console,work.x+11*scale,work.y-102*scale,86*scale,95*scale)});
        }
        drawables.push({depth:track.y,draw:()=>{
          ctx.fillStyle='rgba(23,25,55,'+(.30-track.height*.008)+')';ctx.beginPath();
          ctx.ellipse(position.x-6*scale,position.y,(13-track.height*.16)*scale,3*scale,0,0,Math.PI*2);ctx.fill();
          if(worker.key===selectedWorker)ring(position,16*scale,worker.status.colour);
          const moving=worker.status.animate && track.journey,working=worker.status.animate && !track.journey && (!isDemo||worker.status.area==='console');
          const row=moving?0:working?2:1,frame=moving?track.frame:working?Math.floor(track.phase*5)%6:0;
          const role=model.roles[worker.visual.key],workFlip=working && worker.visual.key!=='console' && track.x>owner.x+384;
          ctx.save();ctx.translate(position.x,position.y-track.height*scale);ctx.scale(scale*(working?(workFlip?-1:1):(track.flip?-1:1)),scale*track.squash);
          if(!worker.status.animate)ctx.globalAlpha=.80;
          const sprite=worker.slot%2?images.amber:images.teal;
          if(working && role.row!==null) {
            const workFrame=Math.floor(track.phase*role.rate)%4;
            ctx.drawImage(sprite,workFrame*96,192+role.row*64,96,64,-32,-58,96,64);
          } else ctx.drawImage(sprite,frame*64,row*64,64,64,-32,-58,64,64);
          ctx.restore();
          ctx.fillStyle=worker.status.colour;ctx.fillRect(position.x-3,position.y+7*scale,6,3);
        }});
        lastPainted.push({kind:'worker',id:worker.key,x:position.x-25*scale,y:position.y-(track.height+54)*scale,width:50*scale,height:60*scale,depth:track.y});
      }
      drawables.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw());
    }
    function updateMotion() {
      element('pause').textContent=paused?'Resume illustration':'Pause illustration';
      element('pause').setAttribute('aria-pressed',String(paused));
      text('motion-state',paused?(motion.matches?'Paused · reduced motion':'Illustration paused'):isDemo?'Scripted work poses and gentle lunar bounds':'Fresh reported activity enables illustrative poses');
    }
    function loop(timestamp) {
      const elapsed=previous?Math.min(.08,(timestamp-previous)/1000):0;previous=timestamp;
      if(!paused && !document.hidden) {
        if(isDemo)demoElapsed+=elapsed;
        for(const worker of view.workers) {
          const status=model.classify(worker.raw,{...currentContext(),kind:worker.kind}),track=tracks.get(worker.key);
          if(!status.animate||!track)continue;
          track.phase+=elapsed;
          if(track.journey) {
            track.journey.elapsed+=elapsed;
            const pose=model.pose(track.journey.elapsed,track.journey.from,track.journey.to,bound);
            Object.assign(track,pose);if(pose.done)track.journey=null;
          }
        }
      }
      if(assetsReady && (dirty || drag || (!paused && view.workers.some(w=>w.status.animate)))) {draw();dirty=false;}
      requestAnimationFrame(loop);
    }
    function zoom(factor) {
      const center=world({x:384,y:300}),next=Math.max(.18,Math.min(1.5,camera.zoom*factor));
      camera={x:center.x-384/next,y:center.y-300/next,zoom:next};dirty=true;
    }
    function overview() {
      if(!view.projects.length)return;
      const minX=Math.min(...view.projects.map(p=>p.x+40)),minY=Math.min(...view.projects.map(p=>p.y+80));
      const maxX=Math.max(...view.projects.map(p=>p.x+700)),maxY=Math.max(...view.projects.map(p=>p.y+680));
      const zoom=Math.min(.85,700/(maxX-minX),415/(maxY-minY));
      camera={x:minX-34/zoom,y:minY-70/zoom,zoom};dirty=true;
      projectFocus=false;
    }
    element('pause').addEventListener('click',()=>{paused=!paused;updateMotion();});
    motion.addEventListener('change',event=>{if(event.matches){paused=true;updateMotion();}});
    element('live-refresh').addEventListener('click',refresh);
    element('live-zoom-in').addEventListener('click',()=>zoom(1.25));
    element('live-zoom-out').addEventListener('click',()=>zoom(.8));
    element('live-overview').addEventListener('click',overview);
    element('live-page-prev').addEventListener('click',()=>{crewPage=Math.max(0,crewPage-1);selectedWorker='';renderLists();renderDetail();});
    element('live-page-next').addEventListener('click',()=>{crewPage++;selectedWorker='';renderLists();renderDetail();});
    canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,camera:{...camera},moved:false};});
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;const rect=canvas.getBoundingClientRect(),dx=(event.clientX-drag.x)*768/rect.width,dy=(event.clientY-drag.y)*512/rect.height;
      if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
      if(drag.moved){camera={...camera,x:drag.camera.x-dx/camera.zoom,y:drag.camera.y-dy/camera.zoom};projectFocus=false;}
    });
    canvas.addEventListener('pointerup',event=>{
      if(!drag)return;const moved=drag.moved;drag=null;if(moved)return;
      const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*768/rect.width,y=(event.clientY-rect.top)*512/rect.height;
      const hit=[...lastPainted].sort((a,b)=>b.depth-a.depth).find(item=>x>=item.x&&x<=item.x+item.width&&y>=item.y&&y<=item.y+item.height);
      if(hit)hit.kind==='worker'?workerPick(hit.id):projectPick(hit.id);
    });
    canvas.addEventListener('pointercancel',()=>{drag=null;});
    canvas.addEventListener('keydown',event=>{
      if(event.code==='Space'){event.preventDefault();paused=!paused;updateMotion();}
      const delta={ArrowLeft:[-50,0],ArrowRight:[50,0],ArrowUp:[0,-50],ArrowDown:[0,50]}[event.key];
      if(delta){event.preventDefault();camera.x+=delta[0]/camera.zoom;camera.y+=delta[1]/camera.zoom;projectFocus=false;dirty=true;}
    });
    document.addEventListener('visibilitychange',()=>{previous=0;if(!document.hidden)refresh();});
    window.addEventListener('pagehide',()=>requestController?.abort(),{once:true});
    updateMotion();renderConnection();
    Promise.all(Object.entries({terrain:'terrain',habitat:'habitat',console:'console',teal:'astronaut-teal',amber:'astronaut-amber'}).map(([key,name])=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>{images[key]=image;resolve();};image.onerror=()=>reject(new Error('Scene asset unavailable: '+name));image.src='./assets/'+name+'.png';
    }))).then(()=>{assetsReady=true;requestAnimationFrame(loop);}).catch(error=>{connectionError=error.message;renderConnection();});
    refresh();
    setInterval(()=>{if(!document.hidden)refresh();},2500);
    setInterval(()=>{if(snapshot)reconcile();},1000);
  }
  root.LunarLiveView={mount};
})(typeof window !== 'undefined'?window:globalThis);
