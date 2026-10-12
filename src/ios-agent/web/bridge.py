"""Dev mobile-web reverse channel; shares the native broker's owner fence."""
import secrets
import hashlib
import json
import os
import re
import math
import time
from pathlib import Path
from urllib.parse import urlsplit

ACTIONS = {'snapshot', 'element', 'events', 'click', 'fill', 'scroll', 'evaluate', 'state', 'capture'}
try:
    from signals import emit_signal
except ImportError:  # Core is integrated by the release owner.
    emit_signal = None

SIGNAL_NUMBERS = {'durationMs', 'count', 'dropped', 'tracks', 'frames', 'bytes', 'samples', 'packets',
                  'audioTracks', 'videoTracks', 'streamCount', 'peerCount', 'failureCount',
                  'trackCount', 'audioTrackCount', 'videoTrackCount', 'senderCount', 'receiverCount',
                  'candidateCount', 'framesSent', 'framesReceived', 'bytesSent', 'bytesReceived',
                  'packetsSent', 'packetsReceived', 'packetsLost', 'rttMs', 'jitterMs', 'bitrateKbps',
                  'participants', 'sent', 'received', 'drops', 'gaps'}
SIGNAL_BOOLEANS = {'ready', 'visible', 'muted', 'enabled', 'active', 'present'}
SIGNAL_CODES = {'outcome', 'reason', 'code', 'action', 'phase'}
SIGNAL_ENUMS = {'source': {'document', 'react'}, 'provider': {'twilio-video', 'unknown'},
                'strategy': {'pcm-ws', 'opus-ws', 'webrtc', 'unknown'},
                'kind': {'microphone', 'camera', 'audio', 'video', 'unknown'},
                'state': {'granted', 'prompt', 'denied', 'unknown', 'connecting', 'connected',
                          'reconnecting', 'disconnected', 'started', 'stopped', 'ended', 'failed', 'live', 'active', 'inactive'}}
SIGNAL_FIELDS = SIGNAL_NUMBERS | SIGNAL_BOOLEANS | SIGNAL_CODES | set(SIGNAL_ENUMS)
SIGNAL_EVENTS = re.compile(r'^(?:browser|kck\.(?:web|call))\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){0,3}$')
SIGNAL_CODE = re.compile(r'^[a-z][a-z0-9_\-]{0,47}$')


def valid_signal_code(value):
    return (isinstance(value, str) and bool(SIGNAL_CODE.fullmatch(value))
            and not re.search(r'token|secret|password|credential|authorization|cookie|bearer', value)
            and (len(value) <= 15 or '_' in value or '-' in value))


def safe_boot(value):
    return value if isinstance(value, str) and re.fullmatch(r'[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}', value, re.I) else None


def safe_version(value):
    return value if isinstance(value, str) and re.fullmatch(r'web-[a-z0-9]{1,32}(?:[.-][a-z0-9]{1,12}){0,4}', value) else None


def signal(event, **fields):
    if emit_signal is not None:
        try:
            emit_signal('browser', event, **fields)
        except Exception:
            pass  # Logging never changes bridge behavior.


def page_signals(rows, page, state, epoch, request=None):
    """Accept only small, typed metadata from an authenticated page request."""
    if not isinstance(rows, list):
        return
    for row in rows[:8]:
        if not isinstance(row, dict) or set(row) != {'event', 'fields', 'seq', 'sourceAtMs', 'droppedCount'}:
            continue
        seq = row['seq']
        if type(seq) is not int or seq <= state.get('signalSeq', 0) or seq > 1000000000:
            continue
        source_at, dropped = row['sourceAtMs'], row['droppedCount']
        if type(source_at) is not int or not 0 <= source_at <= 4102444800000 or type(dropped) is not int or not 0 <= dropped <= 1000000:
            continue
        event, fields = row['event'], row['fields']
        if not isinstance(event, str) or not SIGNAL_EVENTS.fullmatch(event) or not isinstance(fields, dict) or len(fields) > 8:
            continue
        clean = {}
        for key, value in fields.items():
            if key not in SIGNAL_FIELDS:
                continue
            if key in SIGNAL_NUMBERS and type(value) in (int, float) and math.isfinite(value) and (key != 'participants' or type(value) is int) and 0 <= value <= (1000 if key == 'participants' else 1000000000000):
                clean[key] = value
            elif key in SIGNAL_BOOLEANS and type(value) is bool:
                clean[key] = value
            elif key in SIGNAL_CODES and valid_signal_code(value):
                clean[key] = value
            elif key in SIGNAL_ENUMS and isinstance(value, str) and value in SIGNAL_ENUMS[key]:
                clean[key] = value
        scope = 'kck-call' if event.startswith('kck.call.') else 'kck-web' if event.startswith('kck.web.') else 'browser'
        state['signalSeq'] = seq
        if emit_signal is not None:
            try:
                emit_signal(scope, event, page=page, boot=safe_boot(state.get('boot')), epoch=epoch,
                            version=safe_version(state.get('version')), sourceStream='web-page',
                            sourceAtMs=source_at, sourceSeq=seq, droppedCount=dropped, **clean)
            except Exception:
                pass


class WebBridge:
    def __init__(self, broker, rejected):
        self.b = broker
        self.rejected = rejected
        self._last_rejection = {}
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
        now = self.b.clock()
        if now - self._last_rejection.get(code, float('-inf')) >= 30:
            self._last_rejection[code] = now
            signal('browser.request.rejected', epoch=self.b.epoch, reason=code)
        raise self.rejected(code)

    def tick(self):
        now = self.b.clock()
        self.grants = {k: v for k, v in self.grants.items() if v['expires'] > now}
        for pid, p in list(self.pages.items()):
            if now - p['seen'] > 30:
                if self.b.lease and self.b.lease.get('page') == pid:
                    signal('browser.lease.ended', page=pid, epoch=self.b.epoch, reason='page_disconnected')
                    self.b.revoke('web_page_disconnected')
                signal('browser.page.disconnected', page=pid, epoch=self.b.epoch, boot=safe_boot(p.get('boot')))
                del self.pages[pid]
        for c in self.commands.values():
            if c['status'] in ('queued', 'sent') and now > c['deadline']:
                c.update(status='unknown' if c['status'] == 'sent' else 'expired', reason='deadline_do_not_replay')
                signal('browser.command.terminal', request=c['id'], traceId=c.get('signalTraceId'), sessionId=c.get('signalSessionId'), page=c['page'], epoch=self.b.epoch,
                       action=c['action'], outcome=c['status'], reason=c['reason'])
        if len(self.commands) > 128:
            self.commands = dict(list(self.commands.items())[-64:])

    def revoke(self):
        for c in self.commands.values():
            if c['status'] in ('queued', 'sent'):
                c.update(status='unknown' if c['status'] == 'sent' else 'cancelled', reason='lease_ended_do_not_replay')
                signal('browser.command.terminal', request=c['id'], traceId=c.get('signalTraceId'), sessionId=c.get('signalSessionId'), page=c['page'], epoch=self.b.epoch,
                       action=c['action'], outcome=c['status'], reason=c['reason'])

    def control(self, r):
        self.tick()
        op = r['op']
        if op == 'web_enroll':
            u = urlsplit(r.get('origin', ''))
            if u.scheme != 'https' or not u.hostname or not u.hostname.endswith('.ts.net') or u.port not in (10446, 10520) or u.path not in ('', '/') or u.query or u.fragment or u.username or u.password:
                self.reject('private_web_origin_required')
            token = secrets.token_urlsafe(32)
            self.grants[token] = {'origin': r['origin'].rstrip('/'), 'expires': self.b.clock() + 300, 'rememberBrowser':r.get('rememberBrowser') is True}
            signal('browser.enrollment.granted', epoch=self.b.epoch, rememberBrowser=r.get('rememberBrowser') is True)
            return {'token': token, 'expiresIn': 300}
        if op == 'web_pages':
            return {'pages': [{'id': k, 'browser': p['browser'], 'visible': p['visible'], 'ready': p['ready'], 'path': p['path'], 'indicator': p['indicator'], 'ageMs': int((self.b.clock()-p['seen'])*1000), 'boot':p.get('boot'), 'version':p.get('version')} for k, p in self.pages.items()]}
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
            self.commands[cid] = {'id': cid, 'lease': lease['id'], 'page': lease['page'], 'action': r['action'], 'args': r.get('args', {}), 'status': 'queued', 'deadline': self.b.clock() + 12, 'signalTraceId': (r.get('signalContext') or {}).get('traceId'), 'signalSessionId': (r.get('signalContext') or {}).get('sessionId')}
            signal('browser.command.queued', request=cid, page=lease['page'], lease=lease['id'], epoch=self.b.epoch, action=r['action'])
            return {'id': cid, 'delivery': 'queued', 'replay': False}
        self.reject('unsupported_web_control')

    def persist_clients(self):
        self.clients = dict(list(self.clients.items())[-128:])
        if self.clients_file:
            tmp = self.clients_file.with_suffix('.next')
            fd = os.open(tmp, os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'w') as f:
                os.fchmod(f.fileno(), 0o600)
                json.dump(self.clients, f)
            os.replace(tmp, self.clients_file)

    def authenticate(self, r, origin, kind):
        client = self.clients.get(r.get('page'))
        if not client or client.get('type', 'page') != kind or client['expires'] <= time.time() or client['origin'] != origin or not secrets.compare_digest(hashlib.sha256(str(r.get('token', '')).encode()).hexdigest(), client['hash']):
            self.reject('web_page_auth_required')
        return client

    def mint(self, origin, boot, expires):
        pid, token = secrets.token_hex(16), secrets.token_urlsafe(32)
        self.clients[pid] = {'type':'page','hash':hashlib.sha256(token.encode()).hexdigest(),'origin':origin,'expires':expires}
        self.persist_clients()
        self.pages[pid] = {'origin':origin,'seen':self.b.clock(),'browser':'unknown','visible':False,'ready':False,'path':'/','indicator':False,'boot':boot}
        return {'page':pid,'token':token,'epoch':self.b.epoch}

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
            identity = self.mint(origin, r.get('boot'), time.time()+86400)
            if grant.get('rememberBrowser'):
                rid, token = secrets.token_hex(16), secrets.token_urlsafe(32)
                expiry = self.clients[identity['page']]['expires']
                self.clients[rid] = {'type':'browser','hash':hashlib.sha256(token.encode()).hexdigest(),'origin':origin,'expires':expiry}
                self.persist_clients()
                identity['browserResume'] = {'page':rid,'token':token,'expiresAt':int(expiry*1000)}
            signal('browser.enrollment.joined', page=identity['page'], boot=safe_boot(r.get('boot')), epoch=self.b.epoch,
                   rememberBrowser=grant.get('rememberBrowser') is True)
            return identity
        if op == 'resume':
            client = self.authenticate(r, origin, 'browser')
            if len(self.pages) >= 16:
                self.reject('web_page_limit')
            # Each tab has independent ownership and boot fencing. Resume never
            # extends the original browser consent or revokes another tab.
            identity = self.mint(origin, r.get('boot'), client['expires'])
            signal('browser.enrollment.resumed', page=identity['page'], boot=safe_boot(r.get('boot')), epoch=self.b.epoch)
            return identity
        pid = r.get('page')
        self.authenticate(r, origin, 'page')
        p = self.pages.setdefault(pid, {'origin':origin, 'seen':self.b.clock(), 'browser':'unknown', 'visible':False, 'ready':False, 'path':'/', 'indicator':False, 'boot':r.get('boot')})
        if p.get('boot') != r.get('boot'):
            # A delayed old-document poll/pagehide must not replace a newer
            # document or revoke its owner. This also fences cloned tab storage.
            retired = p.setdefault('retiredBoots', [])
            if r.get('boot') in retired:
                signal('browser.document.stale', page=pid, boot=safe_boot(r.get('boot')), epoch=self.b.epoch, reason='retired_document')
                self.reject('retired_web_document')
            retired.append(p.get('boot'))
            del retired[:-64]
            if self.b.lease and self.b.lease.get('page') == pid:
                signal('browser.lease.ended', page=pid, lease=self.b.lease['id'], epoch=self.b.epoch, reason='document_replaced')
                self.b.revoke('web_document_replaced')
            signal('browser.document.replaced', page=pid, boot=safe_boot(r.get('boot')), epoch=self.b.epoch)
            p['boot'] = r.get('boot')
            p['signalSeq'] = 0
        p.update(seen=self.b.clock(), visible=r.get('visible') is True, ready=r.get('ready') is True, indicator=r.get('indicator') is True)
        if r.get('browser') in ('ios-safari', 'ios-chrome', 'android-chrome', 'desktop-webkit', 'desktop-chromium'):
            p['browser'] = r['browser']
        version = r.get('version')
        if isinstance(version, str) and version.startswith('web-') and len(version) <= 40:
            p['version'] = version
        path = r.get('path', '/')
        if isinstance(path, str) and path.startswith('/') and len(path) <= 256:
            p['path'] = path  # Local synthetic inspection metadata, never a log.
        lease = self.b.lease
        if lease and lease.get('page') == pid and not p['visible']:
            signal('browser.lease.ended', page=pid, lease=lease['id'], epoch=self.b.epoch, reason='foreground_lost')
            self.b.revoke('web_foreground_lost')
            lease = None
        if op == 'result':
            c = self.commands.get(r.get('id'))
            if not c or c['status'] != 'sent' or c['page'] != pid or not lease or c['lease'] != lease['id'] or r.get('epoch') != self.b.epoch or self.b.clock() > c['deadline']:
                rejected_id = r.get('id')
                signal('browser.command.stale_result', page=pid, epoch=self.b.epoch,
                       request=rejected_id if isinstance(rejected_id, str) and re.fullmatch(r'[a-f0-9]{32}', rejected_id) else None,
                       reason='fence_or_deadline')
                self.reject('stale_web_result')
            c.update(status='completed', result=r.get('result'))
            reply=c['result'] if isinstance(c['result'], dict) else {}
            reason=reply.get('error')
            if not valid_signal_code(reason):
                reason='unclassified' if reason is not None else None
            outcome = ('completed' if reply.get('ok') is True else
                       'not_executed' if reason == 'expired_before_execution' else
                       'unknown' if reason in ('execution_deadline_unknown', 'result_limit', 'page_execution_failed', 'unclassified') else
                       'rejected')
            signal('browser.command.terminal', request=c['id'], traceId=c.get('signalTraceId'), sessionId=c.get('signalSessionId'), page=pid, lease=c['lease'], epoch=self.b.epoch,
                   action=c['action'], outcome=outcome,
                   reason=reason, level='info' if outcome == 'completed' else 'warn')
        elif op != 'poll':
            self.reject('unsupported_web_page_operation')
        page_signals(r.get('signals'), pid, p, self.b.epoch, c['id'] if op == 'result' else None)
        wire = None
        if lease and lease.get('surface') == 'web' and lease.get('page') == pid:
            wire = {'id': lease['id'], 'epoch': self.b.epoch, 'remainingMs': int(min(15, max(0, lease['expires'] - self.b.clock())) * 1000)}
        response = {'lease': wire, 'epoch': self.b.epoch}
        with self.b.cv:self.b.cv.notify_all()
        for c in self.commands.values():
            if c['status'] == 'queued' and c['page'] == pid and wire and c['lease'] == wire['id']:
                c['status'] = 'sent'
                signal('browser.command.dispatched', request=c['id'], traceId=c.get('signalTraceId'), sessionId=c.get('signalSessionId'), page=pid, lease=c['lease'], epoch=self.b.epoch,
                       action=c['action'])
                response['command'] = {k: c[k] for k in ('id', 'action', 'args', 'lease')}
                response['command']['remainingMs'] = int((c['deadline'] - self.b.clock()) * 1000)
                break
        return response
