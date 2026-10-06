"""Tests for notify-curator against a synthetic usernoted database.

Run: /usr/bin/python3 -m unittest discover -s src/notify-curator -v
Nothing here touches the real Notification Center database or posts a
notification: every path and both notifier binaries are redirected.
"""

import importlib
import json
import os
import plistlib
import sqlite3
import sys
import tempfile
import time
import unittest

TMP = tempfile.mkdtemp(prefix='notify-curator-test-')
P = lambda *a: os.path.join(TMP, *a)
SID = 'local_11111111-2222-3333-4444-555555555555'
SID2 = 'local_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
CLI = '11111111-2222-3333-4444-555555555555'
CLI_OLD = '99999999-2222-3333-4444-555555555555'
APPLE_EPOCH = 978307200


def setUpModule():
    for d in ('state', 'sessions/acct/org', 'driver', 'projects/proj', 'bin'):
        os.makedirs(P(d), exist_ok=True)
    env = {
        'NOTIFY_CURATOR_DB': P('db'), 'NOTIFY_CURATOR_NCPREFS': P('ncprefs.plist'),
        'NOTIFY_CURATOR_STATE': P('state'), 'NOTIFY_CURATOR_CONFIG': P('config.json'),
        'NOTIFY_CURATOR_NOTIFIER': P('bin', 'notifier'), 'NOTIFY_CURATOR_OSASCRIPT': P('bin', 'osascript'),
        'NOTIFY_CURATOR_SESSIONS': P('sessions'), 'NOTIFY_CURATOR_DRIVER_STATE': P('driver'),
        'NOTIFY_CURATOR_PROJECTS': P('projects'),
    }
    os.environ.update(env)
    for name in ('notifier', 'osascript'):
        with open(P('bin', name), 'w') as f:
            f.write('#!/bin/sh\n'
                    f'[ -f "{P("bin", name + ".fail")}" ] && exit 1\n'
                    'python3 -c \'import json,sys; print(json.dumps(sys.argv[1:]))\' "$@" >> '
                    f'"{P("bin", name + ".log")}"\n')
        os.chmod(P('bin', name), 0o755)
    con = sqlite3.connect(P('db'))
    con.executescript('''
        CREATE TABLE app (app_id INTEGER PRIMARY KEY, identifier VARCHAR, badge INTEGER NULL);
        CREATE TABLE record (rec_id INTEGER PRIMARY KEY, app_id INTEGER, uuid BLOB, data BLOB, request_date REAL,
                             request_last_date REAL, delivered_date REAL, presented Bool, style INTEGER,
                             snooze_fire_date REAL);
        INSERT INTO app VALUES (151, 'com.anthropic.claudefordesktop', NULL);
        INSERT INTO app VALUES (7, 'com.apple.mail', NULL);''')
    con.commit()
    con.close()
    set_style(2)
    global nc
    sys.path.insert(0, os.path.dirname(__file__))
    nc = importlib.import_module('notify_curator')


def set_style(style):
    flags = 0x412803103 | (style << 3)
    with open(P('ncprefs.plist'), 'wb') as f:
        plistlib.dump({'apps': [{'bundle-id': 'com.apple.mail', 'flags': 0x8},
                                {'bundle-id': 'com.anthropic.claudefordesktop', 'flags': flags}]}, f, fmt=plistlib.FMT_BINARY)
    global _tick
    _tick = globals().get('_tick', 0) + 1  # distinct mtimes: the curator caches by mtime
    os.utime(P('ncprefs.plist'), ns=(time.time_ns() + _tick * 1000, time.time_ns() + _tick * 1000))


def keyed_archive(d):
    keys, vals = list(d), list(d.values())
    objs = ['$null', None] + keys + vals + [{'$classname': 'NSDictionary', '$classes': ['NSDictionary', 'NSObject']}]
    n = len(keys)
    objs[1] = {'NS.keys': [plistlib.UID(2 + i) for i in range(n)],
               'NS.objects': [plistlib.UID(2 + n + i) for i in range(n)],
               '$class': plistlib.UID(2 + 2 * n)}
    return plistlib.dumps({'$version': 100000, '$archiver': 'NSKeyedArchiver', '$top': {'root': plistlib.UID(1)},
                           '$objects': objs}, fmt=plistlib.FMT_BINARY)


def add_record(iden, title, body='', sid=None, sound=False, app=151, age=0.0, rec_id=None):
    req = {'iden': iden, 'titl': title, 'body': body, 'dest': 15}
    if sid:
        req['thre'] = f'session-{sid}'
        req['usda'] = keyed_archive({'type': 'idle_notification', 'product': 'ccd', 'sessionId': sid})
    if sound:
        req['soun'] = {}
    data = plistlib.dumps({'app': 'x', 'req': req, 'styl': 2}, fmt=plistlib.FMT_BINARY)
    con = sqlite3.connect(P('db'))
    con.execute('DELETE FROM record WHERE app_id = ? AND data LIKE ?', (app, b'%' + iden.encode() + b'%'))
    con.execute('INSERT INTO record (rec_id, app_id, data, delivered_date) VALUES (?, ?, ?, ?)',
                (rec_id, app, data, time.time() - APPLE_EPOCH - age))
    con.commit()
    con.close()


def drop_record(iden):
    con = sqlite3.connect(P('db'))
    for rec_id, data in con.execute('SELECT rec_id, data FROM record').fetchall():
        if plistlib.loads(data)['req']['iden'] == iden:
            con.execute('DELETE FROM record WHERE rec_id = ?', (rec_id,))
    con.commit()
    con.close()


def clear_all():
    con = sqlite3.connect(P('db'))
    con.execute('DELETE FROM record')
    con.commit()
    con.close()
    for f in ('notifier.log', 'osascript.log', 'notifier.fail', 'osascript.fail', 'config.json'):
        for base in (P('bin', f), P(f)):
            if os.path.exists(base):
                os.remove(base)
    for f in os.listdir(P('sessions/acct/org')):
        os.remove(P('sessions/acct/org', f))
    for f in os.listdir(P('projects/proj')):
        os.remove(P('projects/proj', f))
    write_registry({})


def calls(name='notifier'):
    try:
        with open(P('bin', name + '.log')) as f:
            return [json.loads(l) for l in f]
    except FileNotFoundError:
        return []


def write_session(sid, **fields):
    rec = {'sessionId': sid, 'cliSessionId': CLI, 'cwd': '/Users/taylor/src/github/kickoff', 'title': 'real work'}
    rec.update(fields)
    with open(P('sessions/acct/org', f'{sid}.json'), 'w') as f:
        json.dump({k: v for k, v in rec.items() if v is not None}, f)


def write_registry(reg):
    with open(P('driver', 'registry.json'), 'w') as f:
        json.dump({'sessions': {}, 'folders': {}, **reg}, f)


def write_transcript(cli, entries):
    with open(P('projects/proj', f'{cli}.jsonl'), 'w') as f:
        for e in entries:
            f.write(json.dumps(e, separators=(',', ':')) + '\n')


def user(text, **kw):
    return {'type': 'user', 'message': {'role': 'user', 'content': text}, **kw}


def assistant(text):
    return {'type': 'assistant', 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': text}]}}


RECYCLE = ('Another Claude session sent a message:\n<cross-session-message from="local_x" name="PR Watcher">\n'
           "Pool recycle v1 — this session's work is finished and it is being returned to Taylor's session pool")


class Base(unittest.TestCase):
    def setUp(self):
        clear_all()
        set_style(2)

    def classify(self, iden, title='t', body='b', sid=None):
        add_record(iden, title, body, sid=sid)
        rec = nc.read_records()[iden]
        return nc.classify(rec, nc.Sessions(), nc.load_config())


class TestRecords(Base):
    def test_reads_only_claude_and_decodes_userinfo(self):
        add_record(f'idle-{SID}', 'my session', 'did a thing', sid=SID, sound=True)
        add_record('mail-1', 'mail', app=7)
        recs = nc.read_records()
        self.assertEqual(list(recs), [f'idle-{SID}'])
        r = recs[f'idle-{SID}']
        self.assertEqual(r['info']['sessionId'], SID)
        self.assertTrue(r['sound'])
        self.assertAlmostEqual(r['delivered'], time.time(), delta=5)

    def test_alert_style_decoding(self):
        for style in (0, 1, 2):
            set_style(style)
            self.assertEqual(nc.claude_alert_style(), style)

    def test_missing_db_is_an_error_not_empty(self):
        with self.assertRaises(nc.DBUnavailable):
            nc.read_records(P('nope', 'db'))


class TestClassify(Base):
    def test_lifecycle_hidden(self):
        for iden, title in [(f'agent-archive-{SID}', 'Claude archived: x'),
                            (f'agent-delete-{SID}', 'Claude deleted: x'),
                            (f'agent-session-clear-{SID}', 'Claude cleared: x'),
                            (f'agent-session-set_effort-{SID}', 'Claude changed the effort for: x'),
                            (f'agent-session-unarchive-{SID}', 'Claude unarchived: x'),
                            (f'agent-session-stop-{SID}', 'Claude stopped: x'),
                            ('scheduled-task-ccd-abc', 'Claude scheduled a task: "x"')]:
            show, reason = self.classify(iden, title)
            self.assertFalse(show, iden)
            self.assertEqual(reason, 'session management')

    def test_wanted_kinds_shown(self):
        write_session(SID)
        self.assertEqual(self.classify(f'idle-{SID}', 'real work', sid=SID), (True, 'turn finished'))
        self.assertEqual(self.classify('ask-question-req1', 'real work', sid=SID), (True, 'needs input'))
        self.assertEqual(self.classify('permission-req2', 'real work', sid=SID), (True, 'needs input'))
        self.assertEqual(self.classify(f'scheduled-{SID}', 'Scheduled task completed'), (True, 'scheduled task finished'))
        self.assertEqual(self.classify('ssh-reconnect-host', 'SSH lost'), (True, 'other (shown by default)'))
        self.assertEqual(self.classify(f'fast-mode-credits-{SID}', 'Fast mode is off'), (True, 'other (shown by default)'))

    def test_unknown_session_fails_open(self):
        self.assertEqual(self.classify(f'idle-{SID2}', 'whatever', sid=SID2), (True, 'turn finished'))

    def test_driver_fixture_folder(self):
        write_session(SID, cwd=os.path.join(P('driver'), 'probe', 'v2-x'))
        self.assertEqual(self.classify(f'idle-{SID}', 'anything', sid=SID), (False, 'automation: claude-driver fixture folder'))

    def test_probe_kind(self):
        write_session(SID)
        write_registry({'sessions': {SID: {'kind': 'probe'}}})
        self.assertFalse(self.classify(f'idle-{SID}', 'x', sid=SID)[0])

    def test_automation_titles(self):
        write_session(SID, title='x')
        for t in ('pool · kickoff · idle', 'claude-driver v2 pressure 2026-10-06T21-36-10-886Z locked',
                  'claude-driver tool pressure 2026', 'claude-driver pool pressure 2026', 'claude-driver-broker',
                  'cd-perm P1 default'):
            self.assertEqual(self.classify(f'idle-{SID}', t, sid=SID), (False, 'automation: automation title'), t)
        for t in ('claude-driver: fix pool bug', 'Fleet: Implement', '6566 google-signin-exact-email',
                  'pressure test the login flow'):
            self.assertTrue(self.classify(f'idle-{SID}', t, sid=SID)[0], t)

    def test_recycle_turn_via_request_transcript(self):
        # The recycle turn cleared the session: its record has no transcript,
        # the pool entry still names the one the recycle was sent to.
        write_session(SID, cliSessionId=None)
        write_registry({'pool': {SID: {'state': 'recycling', 'cliAtRequest': CLI_OLD,
                                       'requestedAt': time.time() * 1000 - 3_600_000}}})
        write_transcript(CLI_OLD, [user('do the work'), assistant('done'), user(RECYCLE, origin={'kind': 'peer'}),
                                   assistant('recycled: unbind=done')])
        self.assertEqual(self.classify(f'idle-{SID}', '6544 meet', sid=SID), (False, 'automation: pool recycle turn'))

    def test_recycle_declined_is_shown(self):
        write_session(SID, cliSessionId=CLI_OLD)
        write_registry({'pool': {SID: {'state': 'recycling', 'cliAtRequest': CLI_OLD, 'requestedAt': time.time() * 1000}}})
        write_transcript(CLI_OLD, [user(RECYCLE), assistant('recycle declined: PR #6549 is still open')])
        self.assertEqual(self.classify(f'idle-{SID}', '6549', sid=SID), (True, 'turn finished'))

    def test_stuck_recycling_entry_does_not_hide_later_work(self):
        write_session(SID, cliSessionId=CLI_OLD)
        write_registry({'pool': {SID: {'state': 'recycling', 'cliAtRequest': CLI_OLD, 'requestedAt': time.time() * 1000}}})
        write_transcript(CLI_OLD, [user(RECYCLE), assistant('recycle declined: open PR'),
                                   user('ok, merge it now'), assistant('merged')])
        self.assertEqual(self.classify(f'idle-{SID}', '6549', sid=SID), (True, 'turn finished'))

    def test_fresh_recycle_without_transcript_hidden(self):
        write_session(SID, cliSessionId=None)
        write_registry({'pool': {SID: {'state': 'recycling', 'cliAtRequest': CLI_OLD, 'requestedAt': time.time() * 1000}}})
        self.assertEqual(self.classify(f'idle-{SID}', 'x', sid=SID), (False, 'automation: pool recycle in progress'))

    def test_old_recycle_without_transcript_shown(self):
        write_session(SID, cliSessionId=None)
        write_registry({'pool': {SID: {'state': 'recycling', 'cliAtRequest': CLI_OLD,
                                       'requestedAt': time.time() * 1000 - 3_600_000}}})
        self.assertTrue(self.classify(f'idle-{SID}', 'x', sid=SID)[0])

    def test_claimed_pool_session_shown(self):
        write_session(SID, title='new real task')
        write_registry({'pool': {SID: {'state': 'claimed', 'claimedTitle': 'new real task'}}})
        write_transcript(CLI, [user('build the feature'), assistant('built')])
        self.assertTrue(self.classify(f'idle-{SID}', 'new real task', sid=SID)[0])

    def test_marker_in_attachment_or_tool_result_is_not_a_prompt(self):
        write_session(SID)
        write_transcript(CLI, [user('real prompt'),
                               {'type': 'attachment', 'attachment': {'content': RECYCLE}},
                               {'type': 'user', 'message': {'role': 'user', 'content': [
                                   {'type': 'tool_result', 'tool_use_id': 't', 'content': RECYCLE}]}},
                               assistant('answer')])
        self.assertTrue(self.classify(f'idle-{SID}', 'real work', sid=SID)[0])

    def test_config_overrides(self):
        with open(P('config.json'), 'w') as f:
            json.dump({'hide_prefixes': ['ssh-'], 'show_prefixes': ['agent-delete-'],
                       'automation_title_patterns': ['^evals\\b']}, f)
        write_session(SID, title='x')
        self.assertFalse(self.classify('ssh-reconnect-host', 'SSH lost')[0])
        self.assertTrue(self.classify(f'agent-delete-{SID}', 'Claude deleted: x')[0])
        self.assertFalse(self.classify(f'idle-{SID}', 'evals r5', sid=SID)[0])


class TestDaemon(Base):
    def curator(self):
        c = nc.Curator()
        c.refresh_mode(force=True)
        return c

    def test_shadow_posts_nothing(self):
        c = self.curator()
        self.assertEqual(c.mode, 'shadow')
        add_record(f'idle-{SID}', 'real work', 'did it', sid=SID)
        add_record(f'agent-archive-{SID}', 'Claude archived: x')
        c.step()
        self.assertEqual(calls(), [])
        with open(P('state', 'decisions.jsonl')) as f:
            actions = sorted(json.loads(l)['action'] for l in f.readlines()[-2:])
        self.assertEqual(actions, ['would-hide', 'would-show'])

    def test_active_mirrors_withdraws_and_replaces(self):
        set_style(0)
        c = self.curator()
        self.assertEqual(c.mode, 'active')
        add_record(f'idle-{SID}', 'real work', 'first summary', sid=SID)
        add_record(f'agent-session-clear-{SID2}', 'Claude cleared: x', sound=True)
        c.step()
        posted = calls()
        self.assertEqual(len(posted), 1)
        argv = posted[0]
        self.assertEqual(argv[argv.index('-title') + 1], 'real work')
        self.assertEqual(argv[argv.index('-message') + 1], 'first summary')
        self.assertEqual(argv[argv.index('-group') + 1], f'ncur:idle-{SID}')
        self.assertEqual(argv[argv.index('-open') + 1], f'claude://claude.ai/epitaxy/{SID}')
        self.assertNotIn('-sound', argv)
        # Same identifier, new content (a newer turn replaced it): re-posted.
        add_record(f'idle-{SID}', 'real work', 'second summary', sid=SID)
        c.step()
        self.assertEqual(calls()[-1][calls()[-1].index('-message') + 1], 'second summary')
        # Claude withdrew it (Taylor opened the session): withdrawn here too.
        drop_record(f'idle-{SID}')
        c.step()
        self.assertEqual(calls()[-1], ['-remove', f'ncur:idle-{SID}'])
        self.assertEqual(c.mirrored, set())

    def test_sound_kept_for_needs_input(self):
        set_style(0)
        c = self.curator()
        add_record('ask-question-r1', 'real work', 'Which branch?', sid=SID, sound=True)
        c.step()
        self.assertEqual(calls()[0][-2:], ['-sound', 'default'])

    def test_startup_does_not_replay_history(self):
        set_style(0)
        add_record(f'idle-{SID}', 'old', 'old', sid=SID, age=3600)
        add_record(f'idle-{SID2}', 'fresh', 'fresh', sid=SID2, age=5)
        c = self.curator()
        c.baseline(nc.read_records())
        c.step()
        self.assertEqual([a[a.index('-title') + 1] for a in calls()], ['fresh'])

    def test_leaving_active_withdraws_mirrors(self):
        set_style(0)
        c = self.curator()
        add_record(f'idle-{SID}', 'real work', 'x', sid=SID)
        c.step()
        set_style(2)
        c.refresh_mode(force=True)
        self.assertEqual(c.mode, 'shadow')
        self.assertEqual(calls()[-1], ['-remove', f'ncur:idle-{SID}'])

    def test_notifier_failure_falls_back_to_osascript(self):
        set_style(0)
        open(P('bin', 'notifier.fail'), 'w').close()
        c = self.curator()
        add_record(f'idle-{SID}', 'real work', 'x', sid=SID)
        c.step()
        self.assertEqual(calls('osascript')[0][-2:], ['real work', 'x'])
        with open(P('state', 'decisions.jsonl')) as f:
            last = json.loads(f.readlines()[-1])
        self.assertEqual(last['action'], 'show')
        self.assertIn('osascript', last['note'])

    def test_both_notifiers_failing_is_logged(self):
        set_style(0)
        open(P('bin', 'notifier.fail'), 'w').close()
        open(P('bin', 'osascript.fail'), 'w').close()
        c = self.curator()
        add_record(f'idle-{SID}', 'real work', 'x', sid=SID)
        c.step()
        with open(P('state', 'decisions.jsonl')) as f:
            self.assertEqual(json.loads(f.readlines()[-1])['action'], 'show-failed')

    def test_forced_modes(self):
        set_style(0)
        with open(P('config.json'), 'w') as f:
            json.dump({'mode': 'off'}, f)
        c = self.curator()
        add_record(f'idle-{SID}', 'real work', 'x', sid=SID)
        c.step()
        self.assertEqual(calls(), [])


class TestSafety(Base):
    def test_empty_body_gets_text(self):
        add_record('ask-question-r9', 'real work', '   ')
        argv = nc.notifier_argv(nc.read_records()['ask-question-r9'], None)
        self.assertEqual(argv[argv.index('-message') + 1], 'Open in Claude')
        self.assertEqual(argv[argv.index('-activate') + 1], 'com.anthropic.claudefordesktop')

    def test_leading_specials_neutralized(self):
        for s in ('(null)', '{"a":1}', '<x>', '-remove', '[ok]', '"q"'):
            self.assertEqual(nc._safe(s), '\\' + s, s)
        self.assertEqual(nc._safe('  (x)'), '\\(x)')
        self.assertEqual(nc._safe('\\back'), '\\\\back')
        for s in ('PR #6562 fixed', 'ok', '6566 google'):
            self.assertEqual(nc._safe(s), s)


if __name__ == '__main__':
    unittest.main()
