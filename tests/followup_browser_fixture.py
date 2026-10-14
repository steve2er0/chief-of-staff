"""Isolated Mac QA server. No scheduler; every work action is blocked.

Run from the repository: python3 -B tests/followup_browser_fixture.py
The private launch URL and request counts stay in ignored .local evidence.
"""
import copy
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cos.server import Handler, LocalServer
from cos.service import Service
from cos.store import now, uid


class NoModel:
    capabilities = None

    def __getattr__(self, name):
        raise AssertionError('QA never calls a model or worker: ' + name)


class FixtureHandler(Handler):
    def _execute(self, path, raw, request_id):
        self.server.requests.append(path)
        (self.server.evidence / 'requests.json').write_text(json.dumps(self.server.requests))
        if path != '/api/settings':
            return self.send(409, {'error': 'Synthetic QA blocks work actions. No agent was started.'})
        return super()._execute(path, raw, request_id)


def main():
    root = Path(__file__).resolve().parents[1]
    evidence = Path(tempfile.mkdtemp(prefix='followup-qa-', dir=root / '.local'))
    service = Service(evidence / 'data', adapter=NoModel(), start=False)
    service.settings({'schedule_enabled': False})
    project = service.project({'name': 'Synthetic follow-up QA', 'vision': 'Build a sample chart with editable labels'})
    stamp = now()
    base = dict(project_id=project['id'], plan_id='fixture-only', assignment_scope='pieces',
        state='ready_for_review', created=stamp, updated=stamp, started_at=stamp, finished_at=stamp,
        progress='Synthetic report saved.', purpose='Build a chart from the supplied sample',
        goal='Build a sample chart', criteria=['Readable labels'], access='workspace-write',
        execution_policy='sandboxed', research_access=False, expected_outputs=[], history=[], attempt=1,
        config=service.config(), context=service.assignment_context(project), managed_agent=True,
        interactive=False, session_id=uid(), handoff_issues=[], snapshot_limits=[], decisions_needed=[])
    for number, title in enumerate(['Chart draft', 'Chart labels', 'Test follow-up', 'Unclear follow-up']):
        task = copy.deepcopy(base)
        task.update(id=uid(), title=title)
        task['agent_id'] = task['id']
        path = 'docs/chart.svg' if number != 1 else 'docs/labels.svg'
        summary = 'Saved a synthetic chart with editable labels. No live agent was used.'
        task['result'] = dict(status='completed', summary=summary, artifacts=[path], decisions=[], next_steps=[])
        task['output_links'] = [dict(name='chart.svg', label='Synthetic chart', source_path=path, sha256='fixture')]
        if number == 2:
            task['result'].update(artifacts=[], next_steps=['Run regression tests.'])
            task['output_links'] = []
        if number == 3:
            task['result'].update(summary='Which color should I choose?', decisions=['Choose the color'])
        task['conversation'] = [dict(id=uid(), task_id=task['id'], role='user', text=task['purpose'], at=stamp, status='delivered'),
                                dict(id=uid(), task_id=task['id'], role='agent', text=task['result']['summary'], at=stamp)]
        service.store.put('task', task)
    server = LocalServer(0, service)
    server.RequestHandlerClass = FixtureHandler
    server.requests = []
    server.evidence = evidence
    (evidence / 'requests.json').write_text('[]')
    url = server.origin + '/?token=' + server.token
    (evidence / 'launch.json').write_text(json.dumps({'url': url, 'evidence': str(evidence)}))
    (root / '.local' / 'followup-qa-current.txt').write_text(str(evidence))
    print(str(evidence), flush=True)
    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        service.close()


if __name__ == '__main__':
    main()
