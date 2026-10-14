"""Local desktop startup and private single-instance discovery. No model calls."""
import argparse
from contextlib import contextmanager
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import parse_qs, urlsplit
import uuid

from .service import DEFAULT_CONFIG, Service


MANIFEST = 'launch.json'


def private_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.'+path.name+'-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def publish_launch(server):
    path = server.service.data / MANIFEST
    private_json(path, {'pid': os.getpid(), 'url': server.origin+'/?token='+server.token,
                        'instance_id': server.instance_id})
    return path


def remove_launch(path, instance_id):
    try:
        if json.loads(Path(path).read_text()).get('instance_id') == instance_id:
            Path(path).unlink()
    except (OSError, ValueError):
        pass


def connection(url):
    value = urlsplit(url)
    query = parse_qs(value.query)
    if (value.scheme != 'http' or value.hostname != '127.0.0.1' or value.username or value.password or
            value.path != '/' or value.fragment or set(query) != {'token'} or len(query['token']) != 1 or
            not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', query['token'][0])):
        raise ValueError('Invalid local app address')
    if not value.port or not 0 < value.port < 65536:
        raise ValueError('Invalid local app port')
    return value, query['token'][0]


def request(url, path, body=None, csrf=None):
    address, token = connection(url)
    client = http.client.HTTPConnection('127.0.0.1', address.port, timeout=2)
    headers = {'Cookie': 'cos_session='+token}
    if body is not None:
        headers.update({'Content-Type': 'application/json', 'X-CoS-CSRF': csrf,
                        'Origin': 'http://127.0.0.1:'+str(address.port)})
        body = json.dumps(dict(body, request_id=str(uuid.uuid4())))
    try:
        client.request('POST' if body is not None else 'GET', path, body, headers)
        response = client.getresponse()
        value = json.loads(response.read(1024*1024))
        if response.status != 200:
            raise ValueError(value.get('error', 'The local app could not complete this action'))
        return value
    finally:
        client.close()


def running_app(data):
    try:
        record = json.loads((Path(data)/MANIFEST).read_text())
        if type(record.get('pid')) is not int or record['pid'] <= 0:
            return None
        os.kill(record['pid'], 0)
        status = request(record['url'], '/api/launcher')
        if status.get('app') != 'chief-of-staff' or status.get('instance_id') != record['instance_id']:
            return None
        return record, status
    except (OSError, ValueError, KeyError, TypeError, http.client.HTTPException):
        return None


def codex_executable(preferred=None):
    candidates = [preferred, shutil.which('codex')]
    candidates += [str(Path.home()/folder/'codex') for folder in ('.local/bin', 'bin')]
    candidates += ['/opt/homebrew/bin/codex', '/usr/local/bin/codex']
    versions = list((Path.home()/'.nvm/versions/node').glob('*/bin/codex'))
    def version(path):
        return tuple(int(x) for x in re.findall(r'\d+', path.parent.parent.name))
    candidates += [str(path) for path in sorted(versions, key=version, reverse=True)]
    for value in candidates:
        if value and Path(value).is_file() and os.access(value, os.X_OK):
            # Keep the bin path, rather than resolving a JS entrypoint symlink;
            # its sibling node executable must also be on Finder's PATH.
            return str(Path(value).absolute())
    raise ValueError('Codex CLI was not found. Install it, then run the icon installer again.')


def cli_model(config_home=None):
    """Read only model/profile preferences; never copy credentials into the app."""
    path = Path(config_home or os.environ.get('CODEX_HOME') or Path.home()/'.codex')/'config.toml'
    if not path.is_file():
        return None
    root, profiles, section = {}, {}, ''
    for line in path.read_text(encoding='utf-8').splitlines():
        title = re.fullmatch(r'\s*\[([^\]]+)\]\s*(?:#.*)?', line)
        if title:
            section = title[1]
            continue
        match = re.fullmatch(r'\s*(model|profile)\s*=\s*("(?:[^"\\]|\\.)*"|\'[^\']*\')\s*(?:#.*)?', line)
        if not match:
            continue
        literal = match[2]
        value = json.loads(literal) if literal.startswith('"') else literal[1:-1]
        if section == '':
            root[match[1]] = value
        elif section.startswith('profiles.'):
            name = section[len('profiles.'):].strip('"\'')
            profiles.setdefault(name, {})[match[1]] = value
    return profiles.get(root.get('profile'), {}).get('model') or root.get('model')


def cli_settings(config, executable, config_home=None):
    if config['mode'] == 'codex':
        return {}  # Keep the owner's existing CLI/model choices on reopening.
    changes = {'mode': 'codex', 'executable': executable, 'entrypoint': ''}
    if config['model'] == DEFAULT_CONFIG['model']:
        model = cli_model(config_home)
        if model:
            changes['model'] = model
    return changes


@contextmanager
def launch_lock(data):
    import fcntl
    path = Path(data)/'.desktop-launch.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as lock:
        os.chmod(path, 0o600)
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        yield


def open_app(repo, data, executable, python=sys.executable, config_home=None,
             opener=None, popen=subprocess.Popen, wait_seconds=20):
    repo, data = Path(repo).resolve(), Path(data).resolve()
    if not (repo/'app.py').is_file():
        raise ValueError('The Chief of Staff folder moved. Run the icon installer in its new location.')
    executable = codex_executable(executable)
    environment = dict(os.environ)
    environment['PATH'] = str(Path(executable).parent)+os.pathsep+environment.get('PATH', '/usr/bin:/bin:/usr/sbin:/sbin')
    if config_home:
        environment['CODEX_HOME'] = config_home
    opener = opener or (lambda url: subprocess.run(['/usr/bin/open', url], check=True))
    with launch_lock(data):
        existing = running_app(data)
        if existing:
            record, status = existing
            changes = cli_settings(status['config'], executable, config_home)
            if changes:
                request(record['url'], '/api/settings', changes, status['csrf'])
            opener(record['url'])
            return record
        # The store's instance lock refuses to change defaults under a live
        # unrecognized service. Never kill a process or discard agent state.
        service = Service(data, start=False)
        try:
            changes = cli_settings(service.config(), executable, config_home)
            if changes:
                service.settings(changes)
        finally:
            service.close()
        log = data/'desktop.log'
        fd = os.open(log, os.O_WRONLY|os.O_CREAT|os.O_APPEND, 0o600)
        with os.fdopen(fd, 'ab', buffering=0) as output:
            process = popen([python, '-B', str(repo/'app.py'), '--data-dir', str(data),
                             '--port', '0', '--no-browser'], cwd=str(repo), env=environment,
                            stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                            start_new_session=True)
        deadline = time.monotonic()+wait_seconds
        while time.monotonic() < deadline:
            existing = running_app(data)
            if existing:
                opener(existing[0]['url'])
                return existing[0]
            if process.poll() is not None:
                raise ValueError('The app could not start. Details are in '+str(log))
            time.sleep(.1)
        raise ValueError('The app is still starting. Double-click again to reconnect; details are in '+str(log))


def desktop_main():
    parser = argparse.ArgumentParser(description='Open the live Codex agent workspace without a terminal')
    parser.add_argument('--repo', default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument('--data-dir')
    parser.add_argument('--codex')
    parser.add_argument('--config-home')
    args = parser.parse_args()
    data = Path(args.data_dir or Path(args.repo)/'runtime')
    try:
        open_app(args.repo, data, args.codex, config_home=args.config_home)
    except Exception as error:
        data.mkdir(parents=True, exist_ok=True)
        path = data/'desktop-error.txt'
        fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write('Chief of Staff could not open\n\n'+str(error)+'\n')
        subprocess.run(['/usr/bin/open', '-a', 'TextEdit', str(path)], check=False)
        raise SystemExit(1)
