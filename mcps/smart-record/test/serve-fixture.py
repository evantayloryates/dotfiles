#!/usr/bin/env python3
"""Serve only the authored fixture and the explicitly supplied cursor on loopback."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=47861)
parser.add_argument('--cursor', type=Path, required=True)
parser.add_argument('--fixture', type=Path, default=Path(__file__).with_name('browser-fixture.html'),
                    help='Explicit authored fixture only; no directory is served.')
args = parser.parse_args()
routes = {'/': (args.fixture, 'text/html'),
          '/cursor.svg': (args.cursor, 'image/svg+xml')}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        route = routes.get(self.path.split('?', 1)[0])
        if not route:
            self.send_error(404)
            return
        data = route[0].read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', route[1] + '; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
