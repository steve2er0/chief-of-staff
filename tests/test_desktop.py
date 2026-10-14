"""Desktop launcher lifecycle and local security; no model/provider calls."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import test_app
from cos.desktop import cli_model, cli_settings, connection, open_app, private_json, publish_launch, remove_launch, running_app
from cos.service import DEFAULT_CONFIG


class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name).resolve()
    def tearDown(self):self.tmp.cleanup()

    def test_manifest_is_private_and_only_its_instance_can_remove_it(self):
        path=self.root/'launch.json';private_json(path,{'instance_id':'current','url':'private'})
        self.assertEqual(path.stat().st_mode & 0o777,0o600)
        remove_launch(path,'old');self.assertTrue(path.exists())
        remove_launch(path,'current');self.assertFalse(path.exists())

    def test_only_local_private_launch_urls_are_accepted(self):
        valid='http://127.0.0.1:8876/?token='+'x'*43
        self.assertEqual(connection(valid)[1],'x'*43)
        for url in ('https://external.test/?token='+'x'*43,'http://localhost:8876/?token='+'x'*43,
                    valid+'&extra=1',valid+'#fragment','http://user@127.0.0.1:8876/?token='+'x'*43):
            with self.subTest(url=url),self.assertRaises(ValueError):connection(url)

    def test_cli_preferences_select_profile_without_overriding_owner_app_model(self):
        (self.root/'config.toml').write_text('model="base"\nprofile="work"\n[profiles.work]\nmodel="selected"\n[providers.private]\nmodel="unrelated"\n')
        self.assertEqual(cli_model(str(self.root)),'selected')
        chosen=cli_settings(DEFAULT_CONFIG,'/fixture/codex',str(self.root))
        self.assertEqual(chosen['model'],'selected');self.assertEqual(chosen['mode'],'codex')
        self.assertNotIn('model',cli_settings(dict(DEFAULT_CONFIG,model='owner-model'),'/fixture/codex',str(self.root)))
        self.assertEqual(cli_settings(dict(DEFAULT_CONFIG,mode='codex'),'/fixture/codex',str(self.root)),{})

    def test_concurrent_opens_reuse_one_service_and_keep_finder_node_environment(self):
        repo=self.root/'repo with spaces';repo.mkdir();(repo/'app.py').write_text('fixture')
        node=self.root/'node bin';node.mkdir();cli=node/'codex';cli.write_text('#!/bin/sh\nexit 0\n');cli.chmod(0o755)
        data=self.root/'data';opens=[];starts=[];running=[None]
        class Process:
            def poll(self):return None
        def spawn(args,**kwargs):
            self.assertNotIn('shell',kwargs)
            self.assertTrue(kwargs['start_new_session'])
            self.assertEqual(kwargs['env']['PATH'].split(os.pathsep)[0],str(node))
            self.assertIn(str(repo/'app.py'),args)
            starts.append(args)
            running[0]=({'url':'local-fixture','pid':123},{'config':dict(DEFAULT_CONFIG,mode='codex')})
            return Process()
        with patch('cos.desktop.running_app',side_effect=lambda data:running[0]):
            errors=[]
            def launch():
                try:open_app(repo,data,str(cli),opener=opens.append,popen=spawn)
                except Exception as error:errors.append(error)
            threads=[threading.Thread(target=launch) for _ in range(2)]
            for thread in threads:thread.start()
            for thread in threads:thread.join(3)
            self.assertFalse(errors);self.assertTrue(all(not t.is_alive() for t in threads))
        self.assertEqual(len(starts),1);self.assertEqual(opens,['local-fixture','local-fixture'])
        self.assertEqual((data/'desktop.log').stat().st_mode & 0o777,0o600)


class DesktopHTTPTests(unittest.TestCase):
    setUp=test_app.HTTPTests.setUp
    tearDown=test_app.HTTPTests.tearDown
    request=test_app.HTTPTests.request

    def test_discovery_requires_cookie_and_instance_match(self):
        self.assertEqual(self.request('/api/launcher',auth=False)[0],401)
        status,body,_=self.request('/api/launcher');self.assertEqual(status,200)
        info=json.loads(body);self.assertEqual(info['app'],'chief-of-staff')
        self.assertNotIn('tasks',info)
        path=publish_launch(self.server)
        try:
            self.assertEqual(running_app(self.s.data)[0]['instance_id'],info['instance_id'])
            record=json.loads(path.read_text());record['instance_id']='another-instance';private_json(path,record)
            self.assertIsNone(running_app(self.s.data))
        finally:remove_launch(path,'another-instance')


class DesktopProcessTests(unittest.TestCase):
    def test_real_server_publishes_and_cleans_its_private_address_without_model_calls(self):
        repo=Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temporary:
            data=Path(temporary)
            process=subprocess.Popen([sys.executable,'-B',str(repo/'app.py'),'--data-dir',str(data),'--port','0','--no-browser'],
                                     stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
            try:
                deadline=time.monotonic()+5
                while time.monotonic()<deadline and not running_app(data) and process.poll() is None:time.sleep(.05)
                live=running_app(data);self.assertIsNotNone(live)
                self.assertEqual(live[1]['config']['mode'],'simulated')
                self.assertEqual(live[0]['pid'],process.pid)
            finally:
                process.send_signal(signal.SIGINT)
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait()
                error=process.stderr.read();process.stderr.close()
            self.assertEqual(process.returncode,0,error)
            self.assertFalse((data/'launch.json').exists())
