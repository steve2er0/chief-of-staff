"""Isolated read-only CoS QA service and measured Canvas evidence capture.

The only accepted POST writes image/animation evidence to this fixture directory;
no CoS API mutation or operational record is exposed.

No operational data, scheduler, Codex process or real session is opened.
Evidence controls exist only in this QA service with ?qa_capture=1.
"""
import argparse
import base64
import re
from datetime import datetime,timezone,timedelta
import json
from pathlib import Path
import signal
import sys
from urllib.parse import urlsplit,parse_qs

parser=argparse.ArgumentParser()
parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[3])
parser.add_argument('--data-dir',type=Path,required=True)
parser.add_argument('--port',type=int,default=8896)
args=parser.parse_args();project=args.project.resolve();data=args.data_dir.resolve()
if (data/'cos.sqlite3').exists():raise SystemExit('Use a NEW empty fixture directory. Operational stores are never opened.')
sys.path.insert(0,str(project))
from cos.server import LocalServer,Handler
from cos.service import Service
data.mkdir(parents=True,exist_ok=True);control=data/'fixture-state.json';log=data/'requests.jsonl'
def stamp(offset=0):return (datetime.now(timezone.utc)+timedelta(seconds=offset)).isoformat(timespec='seconds')
class FixtureService(Service):
    def snapshot(self):
        base=super().snapshot();current=json.loads(control.read_text())
        base.update(projects=current['projects'],tasks=current['tasks'],jobs=[],lunar_fixture=True)
        return base
service=FixtureService(data,start=False)
projects=[service.project({'name':'QA · '+name,'goal':goal}) for name,goal in [('Flight data','Lander flight data and telemetry'),('Analysis','Rocket model analysis'),('Test data','Engine test data'),('Miscellaneous','General notes and habitat housekeeping')]]
titles=['Assemble lander bracket','Attach flight sensor','Inspect rocket model','Operate analysis console','Weld engine test fixture','Laser scan test data','Repair habitat panel','Operate exterior console']
states=['running','blocked','running','ready_for_review','running','interrupted','paused','accepted']
tasks=[]
for i,(title,state) in enumerate(zip(titles,states)):
    p=projects[i//2];at=stamp(-180 if i==4 else 0)
    tasks.append({'id':'qa-workshop-'+str(i),'project_id':p['id'],'title':title,'state':state,'config':{'mode':'codex'},
        'session_id':'QA-FIXTURE-NOT-A-REAL-SESSION-'+str(i),'worker_pid':100+i,'started_at':stamp(),
        'updated':at,'last_activity_at':at,'latest_update_at':at,'latest_update':'Synthetic QA record; no worker was started.',
        'activity':'file_change: completed' if i%2 else 'command_execution: started','goal':title,'purpose':'Synthetic read-only mapping QA',
        'criteria':['Fixture only'], 'output_links':[], 'history':[], 'context':p,'result':None})
control.write_text(json.dumps({'projects':projects,'tasks':tasks,'failure':False},indent=2))
baseline=list(service.store.db.iterdump());(data/'baseline-store.sql').write_text('\n'.join(baseline))

CAPTURE_JS=r"""
(function(){
 const area=document.createElement('section');area.className='controls';area.setAttribute('aria-label','QA evidence capture');
 const status=document.createElement('span');status.setAttribute('role','status');status.textContent='QA evidence controls · actual Canvas pixels only';
 function button(label,action){const b=document.createElement('button');b.textContent=label;b.addEventListener('click',action);area.append(b);return b;}
 async function download(blob,name){
  const encoded=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
  const response=await fetch('/qa-evidence',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-QA-Evidence':'workshop'},body:JSON.stringify({name,data:encoded})});
  if(!response.ok)throw new Error('QA evidence save failed');
  const a=document.createElement('a');a.href='/qa-evidence/'+name;a.download=name;a.textContent='Download '+name;area.append(a);
 }
 function name(){return (document.getElementById('live-outpost')?.textContent||'scene').replace(/[^a-z0-9]+/gi,'-').toLowerCase();}
 button('Save scene PNG',()=>{document.getElementById('world').toBlob(blob=>{download(blob,'workshop-'+name()+'-scene.png').then(()=>status.textContent='Saved actual Canvas PNG');},'image/png');});
 const record=button('Record 11 seconds of actual frames',async()=>{
  record.disabled=true;status.textContent='Recording actual moving Canvas frames…';
  const source=document.getElementById('world'),sample=document.createElement('canvas');sample.width=384;sample.height=256;
  const context=sample.getContext('2d'),frames=[],times=[],start=performance.now();
  for(let i=0;i<55;i++) {await new Promise(resolve=>setTimeout(resolve,200));await new Promise(resolve=>requestAnimationFrame(resolve));context.drawImage(source,0,0,384,256);times.push(performance.now()-start);frames.push(sample.toDataURL('image/png'));}
  await download(new Blob([JSON.stringify({source:'Actual local Chrome Canvas samples; no reconstructed poses',width:384,height:256,frames,times})],{type:'application/json'}),'workshop-'+name()+'-actual-frames.json');
  status.textContent='Recorded 55 actual frames · capture ready';record.disabled=false;
 });
 area.append(status);document.querySelector('main').append(area);
})();
"""
class FixtureHandler(Handler):
    def do_GET(self):
        u=urlsplit(self.path)
        with log.open('a') as f:f.write(json.dumps({'method':'GET','path':u.path})+'\n')
        if u.path=='/qa-capture.js' and self.authorized():return self.send(200,CAPTURE_JS,'text/javascript; charset=utf-8')
        if u.path.startswith('/qa-evidence/') and self.authorized():
            name=u.path.rsplit('/',1)[-1]
            if re.fullmatch(r'workshop-[a-z0-9-]+\.(png|json)',name):
                target=data/'evidence'/name
                if target.is_file():return self.send(200,target.read_bytes(),'image/png' if target.suffix=='.png' else 'application/octet-stream',attachment=name)
            return self.send(404,{'error':'Unknown QA evidence'})
        if u.path=='/lunar-base/' and parse_qs(u.query).get('qa_capture')==['1'] and self.authorized():
            html=(project/'static/lunar-base/index.html').read_text().replace('</head>','<script src="/qa-capture.js" defer></script></head>')
            return self.send(200,html,'text/html; charset=utf-8')
        if u.path=='/api/state' and self.authorized() and json.loads(control.read_text()).get('failure'):
            return self.send(503,{'error':'Synthetic disconnect fixture'})
        super().do_GET()
    def do_POST(self):
        with log.open('a') as f:f.write(json.dumps({'method':'POST','path':urlsplit(self.path).path})+'\n')
        if urlsplit(self.path).path=='/qa-evidence' and self.authorized() and self.headers.get('Origin')=='http://'+self.headers.get('Host','') and self.headers.get('X-QA-Evidence')=='workshop':
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<40000000:return self.send(413,{'error':'Invalid capture size'})
            payload=json.loads(self.rfile.read(length));name=payload.get('name','')
            if not re.fullmatch(r'workshop-[a-z0-9-]+\.(png|json)',name):return self.send(400,{'error':'Invalid capture name'})
            content=base64.b64decode(payload['data'].split(',',1)[1],validate=True)
            if name.endswith('.png') and not content.startswith(b'\x89PNG'):return self.send(400,{'error':'Invalid PNG'})
            if name.endswith('.json'):json.loads(content)
            destination=data/'evidence';destination.mkdir(exist_ok=True);(destination/name).write_bytes(content)
            return self.send(200,{'saved':name,'scope':'QA evidence only; operational store unchanged'})
        self.send(405,{'error':'QA is read-only; no jobs or mutations.'})
server=LocalServer(args.port,service);server.RequestHandlerClass=FixtureHandler
print('SYNTHETIC QA ONLY · no real workers or jobs.',flush=True)
print('Private fixture launch URL: '+server.origin+'/?token='+server.token,flush=True)
def stop(*unused):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop)
try:server.serve_forever(poll_interval=.3)
except KeyboardInterrupt:pass
finally:
    assert list(service.store.db.iterdump())==baseline,'Fixture store changed'
    assert service.active=={},'Unexpected worker activity'
    server.server_close();service.close()
    print('PASS: fixture database unchanged; active workers empty.',flush=True)
