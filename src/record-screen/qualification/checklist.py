#!/usr/bin/env python3
"""Validate, update and publish the evidence-backed qualification checklist."""
import argparse
from collections import Counter
from datetime import datetime
import hashlib
import html
import json
from pathlib import Path
import re
import tempfile
from string import Template
from zoneinfo import ZoneInfo

SOURCE = Path(__file__).with_name('checklist.json')
OUTPUT = Path('/Users/taylor/src/docs/html/record-screen-strategies/checklist.html')
STATUSES = {
    'completed': ('Completed', '✓', 'Verified for the scope written beside the item. Candidate verification is not production delivery.'),
    'partial': ('Partial', '◐', 'Useful evidence exists; a named part of the acceptance criteria is still open.'),
    'in_progress': ('In progress', '↻', 'Work is currently underway; no completion claim yet.'),
    'needs_retest': ('Needs retest', '!', 'The latest relevant test failed or did not establish the required result.'),
    'pending': ('Pending', '○', 'The acceptance check has not been completed.'),
    'deferred': ('Deferred', '—', 'Intentionally outside the current phase.'),
}
WORKFLOW = {'paused': 'Paused', 'active': 'In progress', 'blocked': 'Needs input', 'complete': 'Complete'}
WORK_STATES = {
    'completed': ('Completed', '✓', 'Delivered or verified for the written scope.'),
    'pending': ('Pending', '↻', 'Work is underway; completion has not been verified.'),
    'ready': ('Ready', '○', 'Can be picked up without an outstanding prerequisite.'),
    'deferred': ('Deferred', '—', 'Wanted, but waiting for the stated environment, participation or evidence.'),
    'review': ('Review', '?', 'An explanation or decision is ready for Taylor’s feedback.'),
}


def timestamp(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError('timestamps must include a timezone')
    return parsed


def validate(data):
    if data['schema'] != 'capture-qualification-checklist/v1':
        raise ValueError('unsupported checklist schema')
    timestamp(data['updated_at'])
    if data['workflow']['state'] not in WORKFLOW or not data['workflow']['note'].strip():
        raise ValueError('invalid workflow state/note')
    if not data['production_note'].strip() or not data['groups']:
        raise ValueError('production note and checklist groups are required')
    ids = set()
    item_ids = set()
    for group in data['groups']:
        for entry in [group, *group['items']]:
            ident = entry['id']
            if not re.fullmatch(r'[a-z][a-z0-9-]*', ident) or ident in ids:
                raise ValueError(f'invalid or duplicate identifier: {ident}')
            ids.add(ident)
            if not entry['title'].strip():
                raise ValueError(f'missing title: {ident}')
        if not group['items']:
            raise ValueError('empty checklist group')
        for item in group['items']:
            item_ids.add(item['id'])
            if item['status'] not in STATUSES:
                raise ValueError(f'invalid status: {item["id"]}')
            if item.get('work_state') not in WORK_STATES:
                raise ValueError(f'invalid work state: {item["id"]}')
            if not item.get('summary', '').strip():
                raise ValueError(f'missing compact summary: {item["id"]}')
            if item['work_state'] == 'deferred':
                for field in ['environment', 'user_involvement', 'ready_when']:
                    if not item.get('prerequisite', {}).get(field, '').strip():
                        raise ValueError(f'deferred item needs {field}: {item["id"]}')
            if item['work_state'] == 'review' and not item.get('review_question', '').strip():
                raise ValueError(f'review item needs a feedback question: {item["id"]}')
            for field in ['scope', 'evidence', 'anchor']:
                if not item[field].strip():
                    raise ValueError(f'missing {field}: {item["id"]}')
            if not re.fullmatch(r'[a-z][a-z0-9-]*', item['anchor']):
                raise ValueError('invalid evidence anchor')
            if item['status'] != 'completed' and not item['next'].strip():
                raise ValueError(f'open item needs a next acceptance step: {item["id"]}')
            if item['status'] == 'partial' and not item.get('why_partial', '').strip():
                raise ValueError(f'partial item needs a plain-language explanation: {item["id"]}')
            timestamp(item['updated_at'])
    for change in data['history']:
        timestamp(change['at'])
        if change['kind'] not in ['workflow','item','work_state']:
            raise ValueError('invalid transition kind')
        allowed = WORKFLOW if change['kind'] == 'workflow' else WORK_STATES if change['kind'] == 'work_state' else STATUSES
        if change['from'] not in allowed or change['to'] not in allowed:
            raise ValueError('invalid transition history')
        if change['kind'] != 'workflow' and change['id'] not in item_ids:
            raise ValueError('history references an unknown item')
    return data


def load_checklist(source=SOURCE):
    return validate(json.loads(Path(source).read_text()))


def atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as file:
        pending = Path(file.name)
        file.write(content)
    try:
        pending.chmod(0o644)
        pending.replace(path)
    finally:
        pending.unlink(missing_ok=True)


def render_checklist(data, output=OUTPUT, report_href='capture-readiness.html'):
    validate(data)
    if Path(report_href).name != report_href or not report_href.endswith('.html'):
        raise ValueError('report link must be a sibling HTML page')
    esc = html.escape
    items = [item for group in data['groups'] for item in group['items']]
    counts = Counter(item['work_state'] for item in items)
    revision = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    updated = timestamp(data['updated_at']).astimezone(ZoneInfo('America/New_York'))
    filters = ''.join(f'<button type="button" class="filter {state}" data-filter="{state}" aria-pressed="true">{esc(label)} <span>{counts[state]}</span></button>' for state, (label, _, _) in WORK_STATES.items())
    legend = ''.join(f'<dt>{esc(label)}</dt><dd>{esc(definition)}</dd>' for label, _, definition in WORK_STATES.values())
    groups = []
    for group in data['groups']:
        rows = []
        for item in group['items']:
            state = item['work_state']
            label, icon, _ = WORK_STATES[state]
            parts = [f'<p><strong>Scope:</strong> {esc(item["scope"])}</p>']
            if item.get('why_partial') and item['status'] == 'partial':
                parts.append(f'<section class="callout"><h4>Why the remaining work is still open</h4><p>{esc(item["why_partial"])}</p></section>')
            if item.get('examples'):
                examples = ''.join(f'<p>{esc(example)}</p>' for example in item['examples'])
                parts.append(f'<section class="callout examples"><h4>What this would look like</h4>{examples}</section>')
            if state == 'deferred':
                prerequisite = item['prerequisite']
                parts.append('<section class="callout"><h4>What moves this to Ready</h4><dl>' + ''.join(f'<dt>{label}</dt><dd>{esc(prerequisite[field])}</dd>' for field,label in [('environment','Environment'),('user_involvement','Your involvement'),('ready_when','Ready when')]) + '</dl></section>')
            if state == 'review':
                parts.append(f'<section class="callout review-note"><h4>For your review</h4><p>{esc(item["review_question"])}</p></section>')
            if item.get('acceptance'):
                parts.append('<h4>Done when</h4><ul>' + ''.join(f'<li>{esc(step)}</li>' for step in item['acceptance']) + '</ul>')
            parts.append(f'<p><strong>Verification record: {esc(STATUSES[item["status"]][0])}.</strong> {esc(item["evidence"])}</p>')
            if item['next']:
                parts.append(f'<p><strong>Next:</strong> {esc(item["next"])}</p>')
            parts.append(f'<a href="{esc(report_href)}#{item["anchor"]}">View supporting evidence</a>')
            if item.get('doc_link'):
                parts.append(f'<a href="{esc(item["doc_link"], quote=True)}">Read the implementation brief</a>')
            rows.append(f'<li class="item" id="{item["id"]}" data-state="{state}"><details class="item-details"><summary><span class="status {state}"><span aria-hidden="true">{icon}</span>{esc(label)}</span><span class="item-heading"><span class="item-title">{esc(item["title"])}</span><span class="item-description">{esc(item["summary"])}</span></span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="item-body">' + ''.join(parts) + '</div></details></li>')
        groups.append(f'<section class="checklist-group" aria-labelledby="{group["id"]}"><h2 id="{group["id"]}">{esc(group["title"])}</h2><ul class="checklist">' + ''.join(rows) + '</ul></section>')
    names = {item['id']:item['title'] for item in items}
    history = []
    for change in reversed(data['history'][-12:]):
        labels = WORKFLOW if change['kind'] == 'workflow' else {s:v[0] for s,v in (WORK_STATES if change['kind'] == 'work_state' else STATUSES).items()}
        name = 'Qualification activity' if change['kind'] == 'workflow' else names[change['id']]
        history.append(f'<li><strong>{esc(name)}:</strong> {esc(labels[change["from"]])} → {esc(labels[change["to"]])}. {esc(change["note"])} <time datetime="{esc(change["at"])}">{esc(timestamp(change["at"]).strftime("%b %d, %I:%M %p %Z"))}</time></li>')
    template = Template(Path(__file__).with_name('checklist-page.html').read_text())
    page = template.substitute(revision=revision, report_href=esc(report_href), updated_at=esc(data['updated_at']), updated_label=esc(updated.strftime('%b %d, %I:%M %p %Z')), filters=filters, legend=legend, groups=''.join(groups), history=''.join(history), workflow=esc(WORKFLOW[data['workflow']['state']]), workflow_note=esc(data['workflow']['note']), production_note=esc(data['production_note']), total=len(items))
    atomic_write(output, page)
    return {'items':len(items), 'counts':dict(counts), 'revision':revision, 'output':str(output)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--report-name', default='capture-readiness.html')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('render')
    commands.add_parser('validate')
    update = commands.add_parser('update')
    update.add_argument('id')
    update.add_argument('--status', choices=STATUSES, required=True)
    update.add_argument('--evidence', required=True)
    update.add_argument('--next', required=True)
    update.add_argument('--scope')
    update.add_argument('--anchor')
    update.add_argument('--why-partial', help='Plain-language reason the remainder is open, what would close it, and the current supported option.')
    work = commands.add_parser('work-state')
    work.add_argument('id')
    work.add_argument('--state', choices=WORK_STATES, required=True)
    work.add_argument('--note', required=True)
    work.add_argument('--summary')
    work.add_argument('--environment')
    work.add_argument('--user-involvement')
    work.add_argument('--ready-when')
    work.add_argument('--review-question')
    workflow = commands.add_parser('workflow')
    workflow.add_argument('--state', choices=WORKFLOW, required=True)
    workflow.add_argument('--note', required=True)
    args = parser.parse_args()
    data = load_checklist(args.source)
    now = datetime.now(ZoneInfo('America/New_York')).isoformat(timespec='seconds')
    if args.command == 'update':
        item = next((item for group in data['groups'] for item in group['items'] if item['id'] == args.id), None)
        if item is None:
            parser.error('unknown checklist item')
        previous = item['status']
        item.update(status=args.status, evidence=args.evidence, next=args.next, updated_at=now)
        for key in ['scope','anchor','why_partial']:
            if getattr(args,key) is not None:
                item[key] = getattr(args,key)
        data['history'].append({'kind':'item','id':args.id,'at':now,'from':previous,'to':args.status,'note':args.evidence})
        data['updated_at'] = now
    elif args.command == 'work-state':
        item = next((item for group in data['groups'] for item in group['items'] if item['id'] == args.id), None)
        if item is None:
            parser.error('unknown checklist item')
        previous = item['work_state']
        item.update(work_state=args.state, work_updated_at=now)
        for key in ['summary', 'review_question']:
            if getattr(args, key) is not None:
                item[key] = getattr(args, key)
        for key in ['environment', 'user_involvement', 'ready_when']:
            if getattr(args, key) is not None:
                item.setdefault('prerequisite', {})[key] = getattr(args, key)
        data['history'].append({'kind':'work_state','id':args.id,'at':now,'from':previous,'to':args.state,'note':args.note})
        data['updated_at'] = now
    elif args.command == 'workflow':
        previous = data['workflow']['state']
        data['workflow'] = {'state':args.state,'note':args.note}
        data['history'].append({'kind':'workflow','at':now,'from':previous,'to':args.state,'note':args.note})
        data['updated_at'] = now
    validate(data)
    if args.command in ['update','workflow','work-state']:
        atomic_write(args.source, json.dumps(data, indent=2, ensure_ascii=False)+'\n')
    if args.command == 'validate':
        print(json.dumps({'valid':True,'items':sum(len(g['items']) for g in data['groups'])}))
    else:
        print(json.dumps(render_checklist(data,args.output,args.report_name)))


if __name__ == '__main__':
    main()
