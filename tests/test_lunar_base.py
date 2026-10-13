"""Private read-only demo routes; no app state or job activity."""
import http.client
import tempfile
import threading
import unittest
from cos.server import LocalServer
from cos.service import Service

class LunarBaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.service = Service(self.tmp.name, start=False)
        self.server = LocalServer(0, self.service)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.service.close()
        self.tmp.cleanup()

    def request(self, path, authenticated=True):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        headers = {'Cookie': 'cos_session=' + self.server.token} if authenticated else {}
        connection.request('GET', path, headers=headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response.status, data, response.getheader('Content-Type')

    def test_demo_requires_existing_private_session(self):
        for path in ['/lunar-base/', '/lunar-base/scene.js', '/lunar-base/assets/astronaut-teal.png']:
            with self.subTest(path=path):
                self.assertEqual(self.request(path, False)[0], 401)

    def test_all_runtime_assets_load_with_correct_types(self):
        paths = {'': 'text/html', 'lunar.css': 'text/css', 'simulation.js': 'text/javascript', 'scene.js': 'text/javascript'}
        for asset in ['terrain', 'habitat', 'console', 'astronaut-teal', 'astronaut-amber']:
            paths['assets/' + asset + '.png'] = 'image/png'
        for path, content_type in paths.items():
            with self.subTest(path=path):
                status, data, actual_type = self.request('/lunar-base/' + path)
                self.assertEqual(status, 200)
                self.assertTrue(actual_type.startswith(content_type))
                self.assertTrue(data)
                if content_type == 'image/png':
                    self.assertTrue(data.startswith(b'\x89PNG\r\n\x1a\n'))

    def test_unknown_and_source_paths_are_not_exposed(self):
        for path in ['source/prompts.json', 'source/astronaut-original.png', '../app.py', 'assets/missing.png']:
            with self.subTest(path=path):
                self.assertEqual(self.request('/lunar-base/' + path)[0], 404)

    def test_demo_does_not_mutate_state_and_navigation_remains(self):
        before = self.service.snapshot()
        before.pop('local_time')
        self.request('/lunar-base/')
        status, data, _ = self.request('/')
        self.assertEqual(status, 200)
        self.assertIn(b'Lunar Base demo', data)
        self.assertIn(b'data-view="projects"', data)
        after = self.service.snapshot()
        after.pop('local_time')
        self.assertEqual(after, before)
