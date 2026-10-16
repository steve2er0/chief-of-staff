"""Isolated UI QA: synthetic records, no scheduler, no workers or model calls.

Launch with python3 -B tests/ui_browser_fixture.py. Launch tokens, generated
artifacts, request details and screenshots belong only in ignored .local/.
"""
import copy
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cos.server import Handler, LocalServer
from cos.service import Service
from cos.store import now, uid
from followup_browser_fixture import NoModel


class FixtureService(Service):
    def snapshot(self):
        snapshot = super().snapshot()
        snapshot['lunar_fixture'] = True
        for task in snapshot['tasks']:
            if task['state'] == 'running':
                task['last_activity_at'] = now()
        return snapshot


class FixtureHandler(Handler):
    def _execute(self, path, raw, request_id):
        self.server.requests.append({'path': path, 'text': raw.get('text', '')})
        (self.server.evidence / 'requests.json').write_text(json.dumps(self.server.requests))
        if path == '/api/agent-reply':
            task = self.server.service.store.get('task', raw['id'])
            task.setdefault('conversation', []).append(dict(id=uid(), task_id=task['id'], role='user', text=raw['text'], at=now(), status='delivered'))
            if raw['text'].startswith('Please plan a synthetic chart label update.'):
                plan = 'Proposed synthetic plan: inspect the sample, update chart labels, and verify the result. Waiting for your approval; no work was executed.'
                task['conversation'].append(dict(id=uid(),task_id=task['id'],role='agent',text=plan,at=now()))
                task['result'] = dict(status='completed',summary=plan,artifacts=[],decisions=[],next_steps=[])
            task['updated'] = now()
            self.server.service.store.put('task', task)
            return self.send(200, task)
        if path not in ('/api/settings', '/api/project', '/api/reveal-artifact'):
            return self.send(409, {'error': 'Synthetic QA blocks work actions. No agent was started.'})
        return super()._execute(path, raw, request_id)


def chart_png():
    width, height = 520, 240
    pixels = [bytearray([14, 25, 42] * width) for _ in range(height)]
    def dot(x, y, color):
        if 0 <= x < width and 0 <= y < height:
            pixels[y][x*3:x*3+3] = bytes(color)
    for x in range(40, 495):
        dot(x, 205, (145, 165, 187))
        y = int(185 - (x-40)*.28 - 26*__import__('math').sin((x-40)/53))
        for dy in range(-2, 3):
            dot(x, y+dy, (98, 220, 228))
    for y in range(25, 205):
        dot(40, y, (145, 165, 187))
    def chunk(name, data):
        return struct.pack('!I', len(data)) + name + data + struct.pack('!I', zlib.crc32(name+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('!2I5B', width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\x00'+row for row in pixels)))+chunk(b'IEND', b'')


def main():
    root = Path(__file__).resolve().parents[1]
    (root / '.local').mkdir(exist_ok=True)
    evidence = Path(tempfile.mkdtemp(prefix='ui-improvements-qa-', dir=root / '.local'))
    service = FixtureService(evidence / 'data', adapter=NoModel(), start=False)
    service.settings({'schedule_enabled': False})
    project = service.project({'name': 'Synthetic lunar research', 'vision': 'Review a synthetic lunar model and chart. No private project data.', 'priority': 'advance'})
    second = service.project({'name': 'Synthetic flight analysis', 'vision': 'Verify synthetic flight data.'})
    stamp = now()
    summary = r'''The model is ready for review. Inline: $E = mc^2$ and $\alpha + \beta = \gamma$.

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

Synthetic generated plot:
![Synthetic lunar plot](chart.png)

Saved [chart.png](chart.png). Folder `reports` contains supporting files; `not-generated.txt` is intentionally missing for QA. A malformed streamed expression stays readable: $\frac{a}{.
'''
    base = dict(project_id=project['id'], plan_id='fixture-only', assignment_scope='pieces',
        state='ready_for_review', created=stamp, updated=stamp, started_at=stamp, finished_at=stamp,
        progress='Synthetic report saved.', purpose='Review the synthetic model',
        goal='Review the lunar model', criteria=['Readable equations'], access='workspace-write',
        execution_policy='sandboxed', research_access=False, expected_outputs=[], history=[], attempt=1,
        config=service.config(), context=service.assignment_context(project), managed_agent=True,
        interactive=False, session_id=uid(), handoff_issues=[], snapshot_limits=[], decisions_needed=[])
    for number, (title, status) in enumerate([('Model review','ready_for_review'),('Analyze measurements','running'),('Inspect habitat','running'),('Review flight plan','running'),('Choose next sample','blocked'),('Queued model checks','queued')]):
        task = copy.deepcopy(base)
        task.update(id=uid(), title=title, state=status, agent_id=uid())
        if number==3:
            task.update(project_id=second['id'],context=service.assignment_context(second))
        task['result'] = dict(status='completed', summary=summary, artifacts=['chart.png'], decisions=[], next_steps=[])
        output = service.data / 'outputs' / task['id']
        output.mkdir(parents=True)
        (output / 'chart.png').write_bytes(chart_png())
        (Path(task['context']['cwd']) / 'chart.png').write_bytes(chart_png())
        (Path(task['context']['cwd']) / 'reports').mkdir(exist_ok=True)
        task['output_links'] = [dict(name='chart.png', label='Synthetic chart', source_path='chart.png', sha256='fixture')]
        if status in ('running', 'queued'):
            task.update(result=None,output_links=[],finished_at=None,progress='Processing synthetic measurements',activity='commandExecution: in progress',activity_at=stamp)
            task['config']['mode'] = 'codex'
            task['worker_pid'] = 123
        task['conversation'] = [dict(id=uid(),task_id=task['id'],role='user',text=task['purpose'],at=stamp,status='delivered'),dict(id=uid(),task_id=task['id'],role='agent',text=summary if number==0 else 'Synthetic activity only. No live worker.',at=stamp)]
        if status=='blocked':
            task.update(progress='Choose the next synthetic sample',owner_attention={'state':'needs_user','items':[{'id':'synthetic-question','kind':'question','text':'Which synthetic sample should be used?','answered':False}]})
        service.store.put('task',task)
    server = LocalServer(0,service)
    server.RequestHandlerClass=FixtureHandler
    server.requests=[]
    server.evidence=evidence
    (evidence/'requests.json').write_text('[]')
    (evidence/'launch.json').write_text(json.dumps({'url':server.origin+'/?token='+server.token,'evidence':str(evidence),'port':server.server_port,'pid':os.getpid()}))
    (root/'.local'/'ui-improvements-qa-current.txt').write_text(str(evidence))
    print(str(evidence),flush=True)
    try:
        server.serve_forever(poll_interval=.3)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        service.close()


if __name__=='__main__':
    main()
