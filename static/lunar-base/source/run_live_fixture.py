"""Isolated browser QA server. Synthetic records only; POST and jobs disabled.

Never point this at the operational CoS data directory.
"""
import argparse
import copy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
from cos.server import LocalServer, Handler
from cos.service import Service

parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8895)
parser.add_argument('--data-dir',required=True)
args=parser.parse_args()
data=Path(args.data_dir).resolve()
if (data/'cos.sqlite3').exists():
    raise SystemExit('Use a new empty fixture directory; operational records are never opened.')
data.mkdir(parents=True,exist_ok=True)
control=data/'fixture-state.json'
requests=data/'requests.jsonl'

class FixtureService(Service):
    def snapshot(self):
        base=super().snapshot()
        current=json.loads(control.read_text())
        base.update(projects=current['projects'],tasks=current['tasks'],jobs=current['jobs'],lunar_fixture=True)
        return base

service=FixtureService(data,start=False)
projects=[service.project({'name':'QA · '+name,'goal':'Synthetic browser fixture for read-only lunar state mapping.'}) for name in ['Research','Build','Review']]
def at(seconds=0):
    return (datetime.now(timezone.utc)+timedelta(seconds=seconds)).isoformat(timespec='seconds')
stamp=at()
def worker(key,project,state,**changes):
    return dict(id=key,project_id=project['id'],title=key.replace('qa-','').replace('-',' ').title(),
        goal='Synthetic fixture: no actual worker was started.',purpose='Read-only state mapping QA.',
        state=state,config={'mode':'codex','model':'fixture'},worker_pid=123,session_id='12345678-1234-4234-8234-123456789abc',
        created=stamp,updated=stamp,started_at=stamp,last_activity_at=stamp,latest_update_at=stamp,
        latest_update='Synthetic fixture update.',progress='Synthetic fixture activity.',
        activity='command_execution: started',criteria=['Fixture only; observe state without mutation.'],
        expected_outputs=[],output_links=[],history=[],decisions_needed=[],attempt=1,access='read-only',
        scenario='success',context=project,result=None,**changes)
tasks=[
    worker('qa-a-running',projects[0],'running'),
    worker('qa-b-reported-blocker',projects[0],'running',reported_status='blocked'),
    worker('qa-c-paused',projects[1],'paused'),
    worker('qa-d-needs-review',projects[1],'ready_for_review'),
    worker('qa-e-completed',projects[2],'accepted'),
    worker('qa-f-unknown',projects[2],'interrupted',recovery_lock=True),
]
stale=worker('qa-g-stale',projects[2],'running');stale['last_activity_at']=at(-180);tasks.append(stale)
queue=worker('qa-h-not-started',projects[0],'queued');queue.update(worker_pid=None,session_id=None,started_at=None,attempt=0);tasks.append(queue)
simulated=worker('qa-i-simulated',projects[0],'running');simulated['config']['mode']='simulated';tasks.append(simulated)
job={'id':'qa-coordinator','project_id':projects[1]['id'],'kind':'conversation','state':'running',
     'worker_pid':456,'session_id':'12345678-1234-4234-8234-123456789def','started_at':stamp,'updated':stamp,
     'last_activity_at':stamp,'latest_update':'Synthetic coordinator fixture.','activity':'command_execution: started'}
control.write_text(json.dumps({'projects':projects,'tasks':tasks,'jobs':[job],'failure':False},indent=2))
baseline=list(service.store.db.iterdump())

class FixtureHandler(Handler):
    def do_GET(self):
        with requests.open('a') as log:log.write(json.dumps({'method':'GET','path':urlsplit(self.path).path})+'\n')
        if urlsplit(self.path).path=='/api/state' and self.authorized() and json.loads(control.read_text()).get('failure'):
            return self.send(503,{'error':'Synthetic disconnect fixture'})
        super().do_GET()
    def do_POST(self):
        with requests.open('a') as log:log.write(json.dumps({'method':'POST','path':urlsplit(self.path).path})+'\n')
        self.send(405,{'error':'Fixture server is read-only. No jobs or mutations are supported.'})

server=LocalServer(args.port,service)
server.RequestHandlerClass=FixtureHandler
print('SYNTHETIC QA ONLY — no real workers or jobs are started.',flush=True)
print('Private fixture launch URL: '+server.origin+'/?token='+server.token,flush=True)
print('Read-only fixture controls: '+str(control),flush=True)
try:
    server.serve_forever(poll_interval=.3)
finally:
    assert list(service.store.db.iterdump())==baseline,'Fixture operational state changed'
    assert service.active=={}
    server.server_close()
    service.close()
