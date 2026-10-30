import json
import os
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
DB = Path(os.environ.get('BLOCKS_DB', ROOT / '.data/blocks.sqlite3'))


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    return db


def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        first_run = not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='categories'").fetchone()
        db.executescript('''
        CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS blocks (
          id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          name TEXT NOT NULL, html TEXT NOT NULL DEFAULT '', css TEXT NOT NULL DEFAULT '');
        ''')
        if first_run:
            db.executemany('INSERT INTO categories(name) VALUES (?)', [('Статьи',), ('Разводящие',), ('Продуктовые',)])


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'static'), **kwargs)

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/library':
            with connect() as db:
                self.reply(200, {table: [dict(r) for r in db.execute(f'SELECT * FROM {table} ORDER BY id')] for table in ('categories', 'blocks')})
        elif self.path.startswith('/api/'):
            self.reply(404, {'error': 'Не найдено'})
        else:
            super().do_GET()

    def mutate(self):
        # This local single-user service accepts writes only from its own origin.
        origin = self.headers.get('Origin')
        if origin and origin not in ('http://' + self.headers.get('Host', ''), 'https://' + self.headers.get('Host', '')):
            return self.reply(403, {'error': 'Недопустимый источник запроса'})
        parts = self.path.strip('/').split('/')
        if len(parts) not in (2, 3) or parts[0] != 'api' or parts[1] not in ('categories', 'blocks'):
            return self.reply(404, {'error': 'Не найдено'})
        table = parts[1]
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 2_000_000:
                return self.reply(413, {'error': 'Слишком большой блок'})
            data = json.loads(self.rfile.read(length) or b'{}')
            if not isinstance(data, dict):
                raise ValueError()
            ident = int(parts[2]) if len(parts) == 3 else None
            with connect() as db:
                if self.command == 'DELETE' and ident is not None:
                    cur = db.execute(f'DELETE FROM {table} WHERE id=?', (ident,))
                elif self.command in ('POST', 'PUT') and ((self.command == 'POST') == (ident is None)):
                    name = data.get('name', '').strip()
                    if not name or len(name) > 160:
                        return self.reply(400, {'error': 'Введите название длиной до 160 символов'})
                    fields, values = ['name'], [name]
                    if table == 'blocks':
                        if not all(isinstance(data.get(k, ''), str) for k in ('html', 'css')):
                            raise ValueError()
                        fields += ['category_id', 'html', 'css']
                        values += [int(data['category_id']), data.get('html', ''), data.get('css', '')]
                    if ident is None:
                        cur = db.execute(f"INSERT INTO {table} ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})", values)
                        ident = cur.lastrowid
                    else:
                        cur = db.execute(f"UPDATE {table} SET {','.join(f+'=?' for f in fields)} WHERE id=?", values + [ident])
                else:
                    return self.reply(405, {'error': 'Метод не поддерживается'})
                if not cur.rowcount:
                    return self.reply(404, {'error': 'Запись не найдена'})
            self.reply(200, {'id': ident})
        except (ValueError, TypeError, KeyError, AttributeError, sqlite3.IntegrityError):
            self.reply(400, {'error': 'Проверьте поля и выбранное направление'})

    do_POST = mutate
    do_PUT = mutate
    do_DELETE = mutate


if __name__ == '__main__':
    initialize()
    server = ThreadingHTTPServer((os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))), Handler)
    print('CMS Blocks started', flush=True)
    server.serve_forever()
