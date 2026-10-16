"""Native macOS Chrome QA with an isolated profile and synthetic fixture only.

Run explicitly, outside unittest discovery. All captures and launch details stay
in ignored .local/. No operational CoS server or browser profile is used.
"""
import base64
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(tempfile.mkdtemp(prefix='ui-browser-review-', dir=ROOT/'.local'))
checks, events = [], []
chrome = fixture = ws = None
request_id = 0


def cdp(method, params=None):
    global request_id
    request_id += 1
    target = request_id
    ws.send(json.dumps({'id': target, 'method': method, 'params': params or {}}))
    while True:
        response = json.loads(ws.recv())
        if response.get('id') != target:
            if response.get('method') in ('Runtime.exceptionThrown', 'Network.loadingFailed'):
                events.append(response)
            continue
        if 'error' in response:
            raise RuntimeError(response['error'])
        return response.get('result', {})


def js(expression):
    result = cdp('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
    if result.get('exceptionDetails'):
        raise RuntimeError(result['exceptionDetails'])
    return result.get('result', {}).get('value')


def wait(expression, timeout=10):
    deadline = time.monotonic()+timeout
    while time.monotonic()<deadline:
        if js(expression):
            return
        time.sleep(.08)
    raise AssertionError('Timed out: '+expression)


def check(label, expression):
    assert js(expression), label
    checks.append(label)


def click(selector):
    encoded = json.dumps(selector)
    js('document.querySelector('+encoded+').scrollIntoView({block:"nearest"})')
    point = js('(()=>{const r=document.querySelector('+encoded+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
    for kind in ('mousePressed', 'mouseReleased'):
        cdp('Input.dispatchMouseEvent', {'type':kind, 'button':'left', 'clickCount':1, **point})


def key(name, modifiers=0):
    code = {'Tab':9, 'Escape':27, 'Backspace':8, 'Enter':13}.get(name, 0)
    for kind in ('keyDown', 'keyUp'):
        event = {'type':kind, 'key':name, 'code':name,
                 'windowsVirtualKeyCode':code, 'nativeVirtualKeyCode':code, 'modifiers':modifiers}
        if kind=='keyDown' and name=='Enter':
            event.update(text='\r',unmodifiedText='\r')
        cdp('Input.dispatchKeyEvent', event)


def capture(name):
    result = cdp('Page.captureScreenshot', {'format':'png'})
    data = base64.b64decode(result['data'])
    (OUT/name).write_bytes(data)
    return data


def close_panel():
    if js('Boolean(document.querySelector("#modal")?.open)'):
        click('#close-modal')


def open_model():
    close_panel()
    click('[data-view="finished"]')
    wait('Boolean(document.querySelector(".status-agent-row [data-task]"))')
    click('.status-agent-row [data-task]')
    wait('Boolean(document.querySelector("#agent-reply-form textarea"))')


try:
    fixture = subprocess.Popen([sys.executable,'-B','tests/ui_browser_fixture.py'],cwd=ROOT,
        stdout=subprocess.PIPE,stderr=open(OUT/'fixture-errors.log','w'),text=True)
    evidence = Path(fixture.stdout.readline().strip())
    assert evidence.is_dir(), 'Fixture initialization failed'
    launch = json.loads((evidence/'launch.json').read_text())
    with tempfile.TemporaryDirectory(prefix='cos-ui-chrome-',dir='/tmp') as profile, tempfile.TemporaryDirectory(prefix='cos-ui-project-',dir='/tmp') as project_folder:
        chrome = subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '--headless=new','--remote-debugging-port=0','--remote-allow-origins=http://localhost',
            '--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-sync',
            '--disable-extensions','--disable-background-networking','--window-size=1440,1000','about:blank'],
            stdout=subprocess.DEVNULL,stderr=open(OUT/'chrome-errors.log','w'))
        port_file = Path(profile)/'DevToolsActivePort'
        deadline = time.monotonic()+15
        while not port_file.exists() and time.monotonic()<deadline:
            time.sleep(.1)
        assert port_file.exists(), 'Isolated Chrome did not start'
        port = port_file.read_text().splitlines()[0]
        with urllib.request.urlopen('http://127.0.0.1:'+port+'/json/list') as response:
            target = next(x for x in json.load(response) if x['type']=='page')
        ws = websocket.create_connection(target['webSocketDebuggerUrl'],origin='http://localhost',timeout=20)
        cdp('Page.enable'); cdp('Runtime.enable'); cdp('Network.enable')
        cdp('Emulation.setDeviceMetricsOverride', {'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
        cdp('Page.navigate', {'url':launch['url']})
        wait('document.querySelector("#live-agent-count")?.textContent==="6 agents"')
        wait('document.querySelector("#live-host-cpu")?.textContent!=="Unavailable"')
        check('all projects visible with automatic updates and simplified controls',
            'document.querySelectorAll("[data-live-worker]").length===6&&!document.querySelector("#live-refresh,#pause,#zoom-in,#zoom-out,#camera-home,#live-project-filter")')
        check('host HUD contains actual Mac metrics',
            'document.querySelector("#live-host-metrics").getAttribute("aria-label").includes("macOS")&&/\\d+%/.test(document.querySelector("#live-host-cpu").textContent)')
        capture('base-desktop.png')
        # Capture the real served animation; changing frames prove ongoing motion.
        frames = []
        for number in range(12):
            frames.append(Image.open(io.BytesIO(capture('motion-%02d.png'%number))).convert('RGB').resize((960,667)))
            time.sleep(.35)
        frames[0].save(OUT/'lunar-motion.gif',save_all=True,append_images=frames[1:],duration=400,loop=0)
        check('Working navigation opens recorded active conversations',
            'document.querySelector("#working-count").textContent==="4"')
        click('[data-view="working"]')
        check('working entries have direct conversation controls',
            'document.querySelectorAll(".status-agent-row [data-task]").length===8')
        width = js('document.querySelector("#modal").getBoundingClientRect().width')
        click('.status-agent-row [data-task]')
        check('busy agents keep Submit and disable the explicit go-ahead',
            'document.querySelector("button[value=go]").disabled&&!document.querySelector("button[value=submit]").disabled')
        close_panel();click('[data-view="projects"]')
        check('Projects lists direct conversation links for both projects',
            'document.querySelectorAll(".project-conversation-links [data-task]").length===6')
        assert abs(js('document.querySelector("#modal").getBoundingClientRect().width')-width)<1
        checks.append('side panel widths are consistent')
        click('#projects-new')
        check('new project creation asks only for a required working directory',
            'document.querySelectorAll("#project-form [name]").length===1&&document.querySelector("#project-form [name=cwd]").required')
        capture('new-project.png')
        click('#project-cwd');cdp('Input.insertText', {'text':project_folder})
        click('#project-form [type=submit]')
        wait('state.projects.length===3')
        check('folder-only creation saves inferred name and canonical directory',
            'state.projects.some(p=>p.name==='+json.dumps(Path(project_folder).name)+'&&p.cwd==='+json.dumps(str(Path(project_folder).resolve()))+')')
        open_model()
        check('composer has Submit and a normal go-ahead without a Plan button or notice',
            'document.querySelectorAll("#agent-reply-form button[type=submit]").length===2&&!document.querySelector("button[value=go]").disabled&&!document.querySelector("button[value=plan],#agent-planning-note")')
        wait('document.querySelectorAll("[data-agent-transcript] .agent-artifact img").length>0&&[...document.querySelectorAll("[data-agent-transcript] .agent-artifact img")].every(i=>i.complete&&i.naturalWidth>0)')
        check('native MathML equations render and malformed source stays readable',
            'document.querySelectorAll("math").length===3&&document.querySelector("math[display=block] mfrac")&&getComputedStyle(document.querySelector("math[display=block]")).display==="block math"&&document.querySelector("[data-agent-transcript]").textContent.includes("malformed streamed expression stays readable: $")')
        check('selected context is honestly unavailable',
            'document.querySelector("#live-context-usage").textContent==="Unavailable"')
        check('saved runs explain absent native token telemetry',
            'document.querySelector("#live-context-note").textContent==="No saved token report"&&document.querySelector("#live-context-metrics").title.includes("no native token usage")')
        capture('conversation-math-image.png')
        click('[data-artifact-enlarge]')
        wait('document.querySelector("#artifact-viewer")?.open&&document.querySelector("#artifact-viewer img").naturalWidth>0')
        capture('image-enlarged.png');click('#artifact-viewer button')
        # Explicit user-action reveal of a synthetic artifact, then read Finder selection.
        click('[data-reveal-artifact]')
        wait('document.querySelector("#toast").textContent.includes("Requested selection")')
        expected = js('state.tasks.find(t=>t.title==="Model review").context.cwd+"/chart.png"')
        reveal = subprocess.run(['/usr/bin/open','-R',expected],capture_output=True,text=True,timeout=5)
        assert reveal.returncode==0, 'Finder rejected the synthetic artifact reveal'
        checks.append('macOS Finder accepted native reveal of the synthetic generated file')
        wait('document.querySelector("#toast").hidden')
        click('#agent-reply-form textarea')
        cdp('Input.insertText', {'text':'Synthetic draft'})
        key('Enter',8)
        check('Shift+Enter adds a newline without sending',
            'document.querySelector("#agent-reply-form textarea").value.endsWith("\\n")')
        before = len(json.loads((evidence/'requests.json').read_text()))
        key('Enter')
        wait('document.querySelector("#agent-reply-status")?.textContent.includes("Message saved")')
        requests = json.loads((evidence/'requests.json').read_text())
        assert len(requests)==before+1 and requests[-1]['text'].strip()=='Synthetic draft'
        checks.append('Enter submits exactly once and preserves explicit feedback')
        check('sent feedback and Submit have non-overlapping bounds',
            'document.querySelector("#agent-reply-status").getBoundingClientRect().top>=document.querySelector("button[value=submit]").getBoundingClientRect().bottom')
        capture('message-sent.png')
        click('#agent-reply-form textarea');cdp('Input.insertText', {'text':'Please plan a synthetic chart label update.'})
        click('button[value=submit]')
        wait('document.querySelector("[data-agent-transcript]").textContent.includes("Proposed synthetic plan:")')
        requests = json.loads((evidence/'requests.json').read_text())
        assert requests[-1]['text']=='Please plan a synthetic chart label update.'
        checks.append('planning is requested by an ordinary unmodified prompt')
        capture('planning-prompt.png')
        click('#agent-reply-form textarea');cdp('Input.insertText', {'text':'Keep the existing sample data.'})
        click('button[value=go]')
        wait('document.querySelector("#agent-reply-status")?.textContent.includes("Go-ahead saved")')
        requests = json.loads((evidence/'requests.json').read_text())
        assert requests[-1]['text'].startswith("Let's go! Please proceed")
        assert requests[-1]['text'].endswith('Keep the existing sample data.')
        assert 'Proposed synthetic plan:' not in requests[-1]['text']
        checks.append('Let’s go sends a normal go-ahead and preserves typed additional instructions')
        for screen in [(900,900),(390,844)]:
            cdp('Emulation.setDeviceMetricsOverride',{'width':screen[0],'height':screen[1],'deviceScaleFactor':1,'mobile':False})
            wait('document.documentElement.clientWidth==='+str(screen[0]))
            check('responsive composer fits at '+str(screen[0])+'px',
                '(()=>{const r=document.querySelector("#modal").getBoundingClientRect();const b=[...document.querySelectorAll(".agent-composer-buttons button")].map(b=>b.getBoundingClientRect());return r.right<=innerWidth+1&&r.left>=-1&&b.every(b=>b.left>=r.left&&b.right<=r.right)&&document.documentElement.scrollWidth<=innerWidth})()')
            capture('conversation-'+str(screen[0])+'.png')
        close_panel()
        capture('base-mobile.png')
        cdp('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
        click('[data-view="settings"]')
        check('accessible reduced-motion setting is present',
            'document.querySelector("[name=lunar_reduced_motion]")!==null')
        click('[name=lunar_reduced_motion]');click('#settings-form [type=submit]')
        wait('localStorage.getItem("cos.lunar.reducedMotion")==="true"')
        close_panel();capture('reduced-motion.png')
        # Frame output should settle while all non-motion UI keeps working.
        hashes = [js('document.querySelector("canvas").toDataURL()') for _ in range(3)]
        assert len(set(hashes))==1, 'Reduced-motion canvas changed'
        checks.append('reduced motion freezes the scene')
        # Browser-only synthetic snapshots; no model turn or server data write.
        js('window.contextFixture=structuredClone(state);window.contextAgent=contextFixture.tasks.find(t=>t.managed_agent&&t.state!=="superseded");contextAgent.context_usage={source:"codex_app_server",basis:"last_model_request",available:false,used_tokens:24000,max_tokens:null,percent:null,updated_at:"2026-10-16T01:00:00Z"};lunarScene.update(contextFixture);lunarScene.selectAgent(AgentModel.identity(contextAgent))')
        check('selected agent shows native token count when its limit is unknown',
            'document.querySelector("#live-context-usage").textContent==="24,000 tokens"&&document.querySelector("#live-context-note").textContent==="Limit not reported"')
        capture('context-unknown-limit.png')
        js('Object.assign(contextAgent.context_usage,{available:true,max_tokens:200000,percent:12});lunarScene.update(contextFixture)')
        check('selected agent updates reported request percentage without a prompt',
            'document.querySelector("#live-context-usage").textContent==="12%"&&document.querySelector("#live-context-metrics").title.includes("not a live measurement")')
        capture('context-last-request.png')
        check('disconnected context reading is explicitly last known',
            '(()=>{lunarScene.update(contextFixture);lunarScene.disconnect("Synthetic QA disconnection");return document.querySelector("#live-context-note").textContent==="Last known request"})()')
        assert not [e for e in events if e.get('method')=='Runtime.exceptionThrown'], 'Browser JavaScript exceptions occurred'
        checks.append('browser has no JavaScript exceptions')
        report = {'checks':checks,'passed':len(checks),'platform':'macOS native headless Chrome','actual_windows':False,
                  'request_paths':[r['path'] for r in json.loads((evidence/'requests.json').read_text())],
                  'synthetic_only':True,'fixture':str(evidence),'captures':str(OUT)}
        (OUT/'browser-results.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))
except BaseException as error:
    (OUT/'failure.json').write_text(json.dumps({'error':str(error),'passed_checks':checks,'events':events},indent=2))
    if ws:
        try:
            capture('failure.png')
        except Exception:
            pass
    print('QA failed; local evidence: '+str(OUT),file=sys.stderr)
    raise
finally:
    if ws:
        ws.close()
    for process in (chrome,fixture):
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=6)
            except subprocess.TimeoutExpired:
                process.kill();process.wait(timeout=3)
