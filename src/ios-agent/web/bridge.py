"""Dev mobile-web reverse channel; shares the native broker's owner fence."""
import secrets
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit

ACTIONS = {'snapshot', 'events', 'click', 'fill', 'scroll', 'evaluate', 'state'}


class WebBridge:
    def __init__(self, broker, rejected):
        self.b = broker
        self.rejected = rejected
        self.grants = {}
        self.pages = {}
        self.clients = {}
        self.clients_file = Path(broker.state) / 'web-clients.json' if broker.state else None
        if self.clients_file and self.clients_file.exists():
            if self.clients_file.stat().st_mode & 0o077 or self.clients_file.stat().st_size > 100000:
                self.reject('private_web_clients_required')
            saved = json.loads(self.clients_file.read_text())
            self.clients = {k:v for k,v in saved.items() if v['expires'] > time.time()}
        self.commands = {}

    def reject(self, code):
        raise self.rejected(code)

    def tick(self):
        now = self.b.clock()
        self.grants = {k: v for k, v in self.grants.items() if v['expires'] > now}
        for pid, p in list(self.pages.items()):
            if now - p['seen'] > 30:
                if self.b.lease and self.b.lease.get('page') == pid:
                    self.b.revoke('web_page_disconnected')
                del self.pages[pid]
        for c in self.commands.values():
            if c['status'] in ('queued', 'sent') and now > c['deadline']:
                c.update(status='unknown' if c['status'] == 'sent' else 'expired', reason='deadline_do_not_replay')
        if len(self.commands) > 128:
            self.commands = dict(list(self.commands.items())[-64:])

    def revoke(self):
        for c in self.commands.values():
            if c['status'] in ('queued', 'sent'):
                c.update(status='unknown' if c['status'] == 'sent' else 'cancelled', reason='lease_ended_do_not_replay')

    def control(self, r):
        self.tick()
        op = r['op']
        if op == 'web_enroll':
            u = urlsplit(r.get('origin', ''))
            if u.scheme != 'https' or not u.hostname or not u.hostname.endswith('.ts.net') or u.port != 10446 or u.path not in ('', '/') or u.query or u.fragment or u.username or u.password:
                self.reject('private_web_origin_required')
            token = secrets.token_urlsafe(32)
            self.grants[token] = {'origin': r['origin'].rstrip('/'), 'expires': self.b.clock() + 300}
            return {'token': token, 'expiresIn': 300}
        if op == 'web_pages':
            return {'pages': [{'id': k, 'browser': p['browser'], 'visible': p['visible'], 'ready': p['ready'], 'path': p['path'], 'indicator': p['indicator'], 'ageMs': int((self.b.clock()-p['seen'])*1000)} for k, p in self.pages.items()]}
        if op == 'web_result':
            c = self.commands.get(r.get('id'))
            if not c or c['lease'] != r.get('lease'):
                self.reject('unknown_web_command')
            return {k: c[k] for k in ('id', 'status', 'result', 'reason') if k in c}
        lease = self.b.lease
        if not lease or lease.get('surface') != 'web' or r.get('lease') != lease['id']:
            self.reject('web_lease_required')
        if op == 'web_action':
            if r.get('action') not in ACTIONS or not isinstance(r.get('args', {}), dict):
                self.reject('unsupported_web_action')
            if any(c['status'] in ('queued', 'sent') for c in self.commands.values()):
                self.reject('web_command_in_flight')
            p = self.pages.get(lease['page'])
            if not p or not p['visible'] or not p['ready']:
                self.reject('web_page_not_ready')
            cid = secrets.token_hex(16)
            self.commands[cid] = {'id': cid, 'lease': lease['id'], 'page': lease['page'], 'action': r['action'], 'args': r.get('args', {}), 'status': 'queued', 'deadline': self.b.clock() + 12}
            return {'id': cid, 'delivery': 'queued', 'replay': False}
        self.reject('unsupported_web_control')

    def page_request(self, r, origin):
        self.tick()
        op = r.get('op')
        if op == 'join':
            grant = self.grants.get(r.get('token'))
            if not grant or grant['origin'] != origin or len(self.pages) >= 16:
                self.reject('web_enrollment_refused')
            # One grant enrolls one tab. Its authenticated session survives reload;
            # every new document boot retires previous ownership and commands.
            del self.grants[r['token']]
            pid, token = secrets.token_hex(16), secrets.token_urlsafe(32)
            self.clients[pid] = {'hash':hashlib.sha256(token.encode()).hexdigest(),'origin':origin,'expires':time.time()+86400}
            self.clients = dict(list(self.clients.items())[-128:])
            if self.clients_file:
                tmp = self.clients_file.with_suffix('.next')
                fd = os.open(tmp, os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
                with os.fdopen(fd,'w') as f:
                    json.dump(self.clients,f)
                os.replace(tmp,self.clients_file)
            self.pages[pid] = { 'origin': origin, 'seen': self.b.clock(), 'browser': 'unknown', 'visible': False, 'ready': False, 'path': '/', 'indicator': False, 'boot': r.get('boot')}
            return {'page': pid, 'token': token, 'epoch': self.b.epoch}
        pid = r.get('page')
        client = self.clients.get(pid)
        if not client or client['expires'] <= time.time() or client['origin'] != origin or not secrets.compare_digest(hashlib.sha256(str(r.get('token', '')).encode()).hexdigest(), client['hash']):
            self.reject('web_page_auth_required')
        p = self.pages.setdefault(pid, {'origin':origin, 'seen':self.b.clock(), 'browser':'unknown', 'visible':False, 'ready':False, 'path':'/', 'indicator':False, 'boot':r.get('boot')})
        if p.get('boot') != r.get('boot'):
            if self.b.lease and self.b.lease.get('page') == pid:
                self.b.revoke('web_document_replaced')
            p['boot'] = r.get('boot')
        p.update(seen=self.b.clock(), visible=r.get('visible') is True, ready=r.get('ready') is True, indicator=r.get('indicator') is True)
        if r.get('browser') in ('ios-safari', 'ios-chrome', 'desktop-webkit', 'desktop-chromium'):
            p['browser'] = r['browser']
        path = r.get('path', '/')
        if isinstance(path, str) and path.startswith('/') and len(path) <= 256:
            p['path'] = path  # Local synthetic inspection metadata, never a log.
        lease = self.b.lease
        if lease and lease.get('page') == pid and not p['visible']:
            self.b.revoke('web_foreground_lost')
            lease = None
        if op == 'result':
            c = self.commands.get(r.get('id'))
            if not c or c['status'] != 'sent' or c['page'] != pid or not lease or c['lease'] != lease['id'] or r.get('epoch') != self.b.epoch or self.b.clock() > c['deadline']:
                self.reject('stale_web_result')
            c.update(status='completed', result=r.get('result'))
        elif op != 'poll':
            self.reject('unsupported_web_page_operation')
        wire = None
        if lease and lease.get('surface') == 'web' and lease.get('page') == pid:
            wire = {'id': lease['id'], 'epoch': self.b.epoch, 'remainingMs': int(min(15, max(0, lease['expires'] - self.b.clock())) * 1000)}
        response = {'lease': wire, 'epoch': self.b.epoch}
        for c in self.commands.values():
            if c['status'] == 'queued' and c['page'] == pid and wire and c['lease'] == wire['id']:
                c['status'] = 'sent'
                response['command'] = {k: c[k] for k in ('id', 'action', 'args', 'lease')}
                response['command']['remainingMs'] = int((c['deadline'] - self.b.clock()) * 1000)
                break
        return response
