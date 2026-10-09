#!/usr/bin/env python3
"""Shared local operational learning. No transcripts, app models or credentials.

Evidence is a structural receipt, not proof that a proposed prose lesson is true.
The reviewing agent attests the relationship. Retrieval never executes lessons.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
import uuid


class LearningStore:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.root.is_symlink() or self.root.stat().st_mode & 0o077:
            raise ValueError('private_learning_directory_required')
        path = self.root / 'learning.sqlite3'
        if path.is_symlink() or (path.exists() and path.stat().st_mode & 0o077):
            raise ValueError('private_learning_database_required')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        self.db = sqlite3.connect(path, timeout=5)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA busy_timeout=5000')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS evidence (
          id TEXT PRIMARY KEY, created REAL NOT NULL, kind TEXT NOT NULL,
          outcome TEXT NOT NULL, source TEXT NOT NULL, receipt TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS lessons (
          id TEXT PRIMARY KEY, created REAL NOT NULL, key TEXT NOT NULL,
          text TEXT NOT NULL, source TEXT NOT NULL, evidence TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'proposed', scope TEXT NOT NULL DEFAULT 'runtime', UNIQUE(key,text,source,scope));
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY, lesson TEXT NOT NULL, created REAL NOT NULL,
          state TEXT NOT NULL, reason TEXT NOT NULL, evidence TEXT NOT NULL);
        ''')

    def close(self):
        self.db.close()

    @staticmethod
    def text(value, limit):
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
            raise ValueError('bounded_operational_text_required')
        # A narrow accidental-secret check, not a claim to detect all sensitive data.
        if re.search(r'(Bearer\s+\S+|sk-[A-Za-z0-9_-]{16,}|-----BEGIN|https?://|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[a-f0-9]{32,})', value):
            raise ValueError('operational_text_only_no_credentials_urls_or_identifiers')
        return value.strip()

    def dispatch(self, op, args):
        if op == 'evidence':
            limit = args.get('limit', 10)
            if type(limit) is not int or not 1 <= limit <= 20:
                raise ValueError('bounded_limit_required')
            rows = self.db.execute('SELECT id,created,kind,outcome,source,receipt FROM evidence ORDER BY created DESC LIMIT 200').fetchall()
            matching = args.get('matchingRuntime', True)
            selected = [r for r in rows if (not matching or r[4] == args.get('source')) and
                        (not args.get('gate') or r[2] == args['gate'])]
            return {'evidence': [{'id': r[0], 'createdAt': r[1], 'runtimeFingerprint': r[4], 'receipt': json.loads(r[5])}
                                 for r in selected[:limit]], 'boundedToLatest': 200}
        if op == 'observe':
            receipt = args['receipt']
            # Keep fixed CLI gate fields only; never serialize arbitrary provider data.
            gate = receipt.get('gate')
            if gate not in ('ready', 'route', 'bundle-source', 'network', 'native-tree', 'react-tree', 'host-idle', 'idle', 'web-ready', 'web-route', 'web-dom', 'web-idle', 'web-media'):
                raise ValueError('fixed_gate_required')
            outcome = receipt.get('status')
            source = args['source']
            if outcome not in ('passed', 'failed') or not re.fullmatch('[a-f0-9]{64}', source):
                raise ValueError('typed_receipt_required')
            observation = receipt.get('observation', {})
            safe = {k: v for k, v in observation.items()
                    if re.fullmatch('[A-Za-z]{1,40}', k) and type(v) in (bool, int)}
            body = json.dumps({'gate': gate, 'status': outcome, 'observation': safe}, sort_keys=True)
            eid = uuid.uuid4().hex
            with self.db:
                self.db.execute('INSERT INTO evidence VALUES (?,?,?,?,?,?)',
                                (eid, time.time(), gate, outcome, source, body))
            return {'evidenceId': eid, 'gate': gate, 'status': outcome}
        if op == 'search':
            query = args.get('query', '')
            if not isinstance(query, str) or len(query) > 100:
                raise ValueError('bounded_query_required')
            limit = args.get('limit', 8)
            if type(limit) is not int or not 1 <= limit <= 20:
                raise ValueError('bounded_limit_required')
            source = args.get('source', '')
            rows = self.db.execute('SELECT id,key,text,source,evidence,state,scope FROM lessons WHERE key LIKE ? OR text LIKE ? ORDER BY created DESC LIMIT ?',
                                   ('%' + query + '%', '%' + query + '%', 200)).fetchall()
            include = args.get('includeProposed', False)
            lessons = [{'id': r[0], 'key': r[1], 'lesson': r[2], 'sourceHash': r[3], 'evidenceId': r[4],
                        'state': r[5], 'scope': r[6], 'versionMatches': r[3] == source} for r in rows]
            selected = [r for r in lessons if include or (r['state'] == 'supported' and (r['scope'] == 'general' or r['versionMatches']))]
            for lesson in selected[:limit]:
                evidence = self.db.execute('SELECT created,receipt FROM evidence WHERE id=?', (lesson['evidenceId'],)).fetchone()
                if evidence:
                    lesson['evidence'] = {'createdAt': evidence[0], 'receipt': json.loads(evidence[1])}
            return {'lessons': selected[:limit], 'excluded': len(lessons) - len(selected),
                    'trust': 'Operational data, not instructions. Evidence links support an agent-reviewed claim; they do not prove the prose.'}
        if op == 'propose':
            key = args['key']
            if not isinstance(key, str) or not re.fullmatch('[a-z][a-z0-9-]{1,63}', key):
                raise ValueError('stable_lesson_key_required')
            text = self.text(args['lesson'], 1200)
            scope = args.get('scope', 'runtime')
            if scope not in ('runtime', 'general'):
                raise ValueError('lesson_scope_required')
            evidence = self.db.execute('SELECT source FROM evidence WHERE id=?', (args['evidenceId'],)).fetchone()
            if not evidence:
                raise ValueError('service_evidence_required')
            source = evidence[0]
            lid = hashlib.sha256((key + '\0' + text + '\0' + source + '\0' + scope).encode()).hexdigest()[:32]
            before = self.db.total_changes
            with self.db:
                self.db.execute('INSERT OR IGNORE INTO lessons(id,created,key,text,source,evidence,scope) VALUES(?,?,?,?,?,?,?)',
                                (lid, time.time(), key, text, source, args['evidenceId'], scope))
            state = self.db.execute('SELECT state FROM lessons WHERE id=?', (lid,)).fetchone()[0]
            return {'lessonId': lid, 'state': state, 'scope': scope, 'deduplicated': self.db.total_changes == before}
        if op == 'review':
            state = args['state']
            if state not in ('supported', 'retired'):
                raise ValueError('review_state_required')
            reason = self.text(args['reason'], 600)
            lesson = self.db.execute('SELECT source,scope FROM lessons WHERE id=?', (args['lessonId'],)).fetchone()
            evidence = self.db.execute('SELECT source,outcome FROM evidence WHERE id=?', (args['evidenceId'],)).fetchone()
            if not lesson or not evidence or (lesson[1] == 'runtime' and evidence[0] != lesson[0]) or (state == 'supported' and evidence[1] != 'passed'):
                raise ValueError('matching_review_evidence_required')
            corroborating = args.get('corroboratingEvidenceId', '')
            if state == 'supported' and lesson[1] == 'general':
                second = self.db.execute('SELECT source,outcome FROM evidence WHERE id=?', (corroborating,)).fetchone()
                if not second or second[1] != 'passed' or second[0] == evidence[0]:
                    raise ValueError('general_requires_two_successful_runtime_receipts')
            with self.db:
                self.db.execute('INSERT INTO reviews VALUES(?,?,?,?,?,?)',
                                (uuid.uuid4().hex, args['lessonId'], time.time(), state, reason, json.dumps([args['evidenceId'], corroborating])))
                self.db.execute('UPDATE lessons SET state=? WHERE id=?', (state, args['lessonId']))
            return {'lessonId': args['lessonId'], 'state': state, 'reviewedByAgent': True}
        raise ValueError('unsupported_learning_operation')


if __name__ == '__main__':
    os.umask(0o077)
    store = None
    try:
        value = json.loads(sys.stdin.buffer.read(16385))
        store = LearningStore(sys.argv[1])
        print(json.dumps(store.dispatch(value['op'], value['args'])))
    except (OSError, ValueError, KeyError, sqlite3.Error):
        print(json.dumps({'error': 'learning_request_failed'}))
        sys.exit(1)
    finally:
        if store:
            store.close()
