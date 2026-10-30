import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
import server


class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        server.DB = Path(self.temp.name) / 'blocks.sqlite3'
        server.initialize()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.http.server_port}'

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, route, method='GET', data=None, origin=None):
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        request = urllib.request.Request(self.url + route, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
        with urllib.request.urlopen(request) as response:
            return json.load(response)

    def test_full_lifecycle_and_persistence(self):
        initial = self.request('/api/library')
        self.assertEqual(len(initial['categories']), 3)
        category = self.request('/api/categories', 'POST', {'name': 'Лендинги'})['id']
        block = {'name': 'Цитата', 'category_id': category, 'html': '<blockquote>Привет</blockquote>', 'css': 'blockquote{color:green}'}
        ident = self.request('/api/blocks', 'POST', block)['id']
        self.assertEqual(self.request('/api/library')['blocks'][0]['html'], block['html'])
        block['name'] = 'Обновлённая цитата'
        self.request(f'/api/blocks/{ident}', 'PUT', block)
        server.initialize()
        self.assertEqual(self.request('/api/library')['blocks'][0]['name'], block['name'])
        self.request(f'/api/blocks/{ident}', 'DELETE')
        self.assertEqual(self.request('/api/library')['blocks'], [])
        self.request('/api/blocks', 'POST', block)
        self.request(f'/api/categories/{category}', 'DELETE')
        self.assertEqual(self.request('/api/library')['blocks'], [])

    def test_validation_and_cross_origin(self):
        for route, data, expected, origin in [('/api/categories', {'name': ' '}, 400, None), ('/api/blocks', {'name': 'x', 'category_id': 999}, 400, None), ('/api/categories', {'name': 'x'}, 403, 'https://untrusted.example')]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request(route, 'POST', data, origin)
            self.assertEqual(error.exception.code, expected)

    def test_frontend_served(self):
        with urllib.request.urlopen(self.url) as response:
            self.assertIn('Личная библиотека'.encode(), response.read())


if __name__ == '__main__':
    unittest.main()
