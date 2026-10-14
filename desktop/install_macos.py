"""Install a local Mac app and Desktop icon using this checkout and existing CLI."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from cos.desktop import codex_executable, private_json

IDENTIFIER = 'com.chiefofstaff.desktop-launcher'

BOOTSTRAP = '''import json,os,sys
from pathlib import Path
config=json.loads((Path(__file__).resolve().parent/'launcher.json').read_text())
args=[config['python'],'-B',str(Path(config['repo'])/'launch_mac.py'),'--repo',config['repo'],'--data-dir',config['data'],'--codex',config['codex']]
if config.get('config_home'):args+=['--config-home',config['config_home']]
os.execv(config['python'],args)
'''


def install(repo=ROOT, applications=None, desktop=None, python=sys.executable, executable=None):
    repo = Path(repo).resolve()
    applications = Path(applications or Path.home()/'Applications')
    desktop = Path(desktop or Path.home()/'Desktop')
    target = applications/'Chief of Staff.app'
    shortcut = desktop/'Chief of Staff.app'
    executable = codex_executable(executable)
    if not (repo/'launch_mac.py').is_file():
        raise ValueError('Select a Chief of Staff checkout with launch_mac.py')
    if target.exists():
        info = target/'Contents/Info.plist'
        if not info.is_file() or plistlib.loads(info.read_bytes()).get('CFBundleIdentifier') != IDENTIFIER:
            raise ValueError('Another app already occupies '+str(target))
    if shortcut.exists() or shortcut.is_symlink():
        if not shortcut.is_symlink() or shortcut.resolve() != target.resolve():
            raise ValueError('Another file already occupies '+str(shortcut))
    applications.mkdir(parents=True, exist_ok=True)
    desktop.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.cos-install-', dir=applications) as temporary:
        bundle = Path(temporary)/target.name
        resources = bundle/'Contents/Resources';resources.mkdir(parents=True)
        binaries = bundle/'Contents/MacOS';binaries.mkdir()
        info = {'CFBundleName':'Chief of Staff','CFBundleDisplayName':'Chief of Staff',
                'CFBundleIdentifier':IDENTIFIER,'CFBundleVersion':'1','CFBundleShortVersionString':'1.0',
                'CFBundlePackageType':'APPL','CFBundleExecutable':'ChiefOfStaff',
                'CFBundleIconFile':'ChiefOfStaff.icns','LSUIElement':True,'NSHighResolutionCapable':True}
        (bundle/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
        (resources/'bootstrap.py').write_text(BOOTSTRAP)
        private_json(resources/'launcher.json',{'repo':str(repo),'data':str(repo/'runtime'),
                    'python':str(Path(python).absolute()),'codex':executable,
                    'config_home':os.environ.get('CODEX_HOME')})
        shutil.copy2(repo/'desktop/ChiefOfStaff.icns',resources/'ChiefOfStaff.icns')
        program = binaries/'ChiefOfStaff'
        subprocess.run(['/usr/bin/xcrun','swiftc',str(repo/'desktop/Launcher.swift'),'-o',str(program)],check=True,capture_output=True)
        subprocess.run(['/usr/bin/codesign','--force','--sign','-',str(bundle)],check=True,capture_output=True)
        backup = Path(temporary)/'previous.app'
        if target.exists():
            target.rename(backup)
        try:
            bundle.rename(target)
        except BaseException:
            if backup.exists():backup.rename(target)
            raise
    if not shortcut.is_symlink():
        shortcut.symlink_to(target, target_is_directory=True)
    return target, shortcut


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description='Install the double-click Chief of Staff icon on this Mac')
    parser.add_argument('--repo',default=str(ROOT))
    args=parser.parse_args()
    if sys.platform != 'darwin':parser.error('This installer is for macOS')
    app,icon=install(args.repo)
    print('Installed app:',app)
    print('Desktop icon:',icon)
