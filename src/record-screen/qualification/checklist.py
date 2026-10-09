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
            for field in ['scope', 'evidence', 'anchor']:
                if not item[field].strip():
                    raise ValueError(f'missing {field}: {item["id"]}')
            if not re.fullmatch(r'[a-z][a-z0-9-]*', item['anchor']):
                raise ValueError('invalid evidence anchor')
            if item['status'] != 'completed' and not item['next'].strip():
                raise ValueError(f'open item needs a next acceptance step: {item["id"]}')
            timestamp(item['updated_at'])
    for change in data['history']:
        timestamp(change['at'])
        if change['kind'] not in ['workflow','item']:
            raise ValueError('invalid transition kind')
        allowed = WORKFLOW if change['kind'] == 'workflow' else STATUSES
        if change['from'] not in allowed or change['to'] not in allowed:
            raise ValueError('invalid transition history')
        if change['kind'] == 'item' and change['id'] not in item_ids:
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
    counts = Counter(item['status'] for item in items)
    revision = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    updated = timestamp(data['updated_at']).astimezone(ZoneInfo('America/New_York'))
    display_date = updated.strftime('%B %d, %Y at %I:%M %p %Z').replace(' 0', ' ')
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="checklist-revision" content="{revision}"><title>Capture foundations checklist</title>
<style>
:root{{color-scheme:light;--ink:#17202b;--paper:#f2f4f6;--line:#c9d3dd;--blue:#24727a}}*{{box-sizing:border-box}}body{{margin:0;color:var(--ink);background:var(--paper);font:17px/1.6 "Avenir Next",system-ui,sans-serif}}main{{max-width:1100px;margin:auto;padding:32px 24px 72px}}a{{color:var(--blue);text-underline-offset:3px}}h1{{font-size:clamp(30px,5vw,46px);line-height:1.15;letter-spacing:-.025em;margin:32px 0 16px}}h2{{font-size:25px;line-height:1.25;margin:42px 0 8px}}p{{max-width:76ch}}.meta{{font-size:15px;color:#455567}}.notice{{background:white;border-left:4px solid #805410;padding:14px 18px;margin:24px 0}}.notice p{{margin:5px 0}}nav,.counts{{display:flex;gap:10px 20px;flex-wrap:wrap}}nav{{margin:22px 0}}.counts{{margin:22px 0}}.status{{display:inline-flex;gap:7px;align-items:center;font-weight:600;font-size:14px;border:1px solid currentColor;border-radius:4px;padding:4px 9px;white-space:nowrap;background:white}}.completed{{color:#24614e}}.partial,.in_progress{{color:#76520f}}.needs_retest{{color:#a12538}}.pending{{color:#465260}}.deferred{{color:#644880}}ul.checklist{{list-style:none;margin:0;padding:0}}.item{{display:grid;grid-template-columns:150px minmax(0,1fr);gap:20px;padding:22px 0;border-top:1px solid var(--line);scroll-margin-top:20px}}.item:last-child{{border-bottom:1px solid var(--line)}}.item h3{{font-size:19px;line-height:1.35;margin:0 0 8px}}.item p{{margin:7px 0;font-size:16px}}.evidence-link,.recorded{{font-size:14px}}.recorded{{color:#455567;margin-left:14px}}.legend{{flex-basis:100%;background:white;padding:16px 20px;margin:26px 0}}.legend summary{{font-weight:600;cursor:pointer}}.legend dl{{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px 20px}}.legend dt{{font-weight:600}}.legend dd{{margin:0}}.history{{padding-left:22px}}.history li{{margin:12px 0}}footer{{margin-top:36px;border-top:1px solid var(--line);padding-top:18px;font-size:15px}}:focus-visible{{outline:3px solid var(--blue);outline-offset:4px}}@media(max-width:600px){{main{{padding:24px 16px 48px}}.item{{grid-template-columns:minmax(0,1fr);gap:10px}}.legend dl{{grid-template-columns:minmax(0,1fr);gap:6px}}.legend dd{{margin-bottom:12px}}.recorded{{display:block;margin:6px 0 0}}}}@media(prefers-reduced-motion:reduce){{html{{scroll-behavior:auto}}}}
</style></head><body><main>
<a href="{esc(report_href)}">Back to Capture foundations</a>
<h1>Capture foundations checklist</h1>
<p>What has been verified, what still needs work, and what comes after capture foundations.</p>
<p class="meta">Updated <time datetime="{esc(data['updated_at'])}">{esc(display_date)}</time>. Each check links to its saved evidence; subsequent state changes are recorded below.</p>
<div class="notice"><p><strong>Qualification: {esc(WORKFLOW[data['workflow']['state']])}.</strong> {esc(data['workflow']['note'])}</p><p>{esc(data['production_note'])}</p></div>
<p><strong>Completed means verified for the stated scope.</strong> It does not mean every app, provider or failure mode is covered. Candidate checks and production delivery are tracked separately.</p>
<div class="counts" aria-label="Checklist status counts">'''
    for status, (label, icon, _) in STATUSES.items():
        if counts[status]:
            page += f'<span class="status {status}"><span aria-hidden="true">{icon}</span>{counts[status]} {esc(label.lower())}</span>'
    page += '<details class="legend"><summary>What the statuses mean</summary><dl>'
    for label, _, definition in STATUSES.values():
        page += f'<dt>{esc(label)}</dt><dd>{esc(definition)}</dd>'
    page += '</dl></details></div><nav aria-label="Checklist sections">'
    for group in data['groups']:
        page += f'<a href="#{group["id"]}">{esc(group["title"])}</a>'
    page += '</nav>'
    for group in data['groups']:
        page += f'<section aria-labelledby="{group["id"]}"><h2 id="{group["id"]}">{esc(group["title"])}</h2><ul class="checklist">'
        for item in group['items']:
            status = item['status']
            label, icon, _ = STATUSES[status]
            page += f'<li class="item" id="{item["id"]}" data-status="{status}"><div><span class="status {status}"><span aria-hidden="true">{icon}</span>{esc(label)}</span></div><div><h3>{esc(item["title"])}</h3><p>{esc(item["scope"])}</p><p><strong>Evidence:</strong> {esc(item["evidence"])}</p>'
            if item['next']:
                page += f'<p><strong>Next:</strong> {esc(item["next"])}</p>'
            page += f'<a class="evidence-link" href="{esc(report_href)}#{item["anchor"]}">View supporting evidence</a><span class="recorded">Status recorded <time datetime="{esc(item["updated_at"])}">{esc(timestamp(item["updated_at"]).astimezone(ZoneInfo("America/New_York")).strftime("%b %d, %I:%M %p %Z"))}</time></span></div></li>'
        page += '</ul></section>'
    page += '<section><h2>Recent state changes</h2>'
    if data['history']:
        names = {item['id']:item['title'] for item in items}
        page += '<ul class="history">'
        for change in reversed(data['history'][-12:]):
            labels = WORKFLOW if change['kind'] == 'workflow' else {s:v[0] for s,v in STATUSES.items()}
            name = 'Qualification activity' if change['kind'] == 'workflow' else names[change['id']]
            changed = timestamp(change['at']).astimezone(ZoneInfo('America/New_York')).strftime('%b %d, %I:%M %p %Z')
            page += f'<li><strong>{esc(name)}:</strong> {esc(labels[change["from"]])} → {esc(labels[change["to"]])}. {esc(change["note"])} <span class="meta">{esc(changed)}</span></li>'
        page += '</ul>'
    else:
        page += '<p>This is the initial reconciled checklist. Subsequent state changes will appear here.</p>'
    page += f'</section><footer><p>This page is regenerated when qualification states or supporting evidence change. Reload an open page to see the latest published checkpoint.</p><a href="{esc(report_href)}">Back to Capture foundations</a></footer></main></body></html>'
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
        for key in ['scope','anchor']:
            if getattr(args,key) is not None:
                item[key] = getattr(args,key)
        data['history'].append({'kind':'item','id':args.id,'at':now,'from':previous,'to':args.status,'note':args.evidence})
        data['updated_at'] = now
    elif args.command == 'workflow':
        previous = data['workflow']['state']
        data['workflow'] = {'state':args.state,'note':args.note}
        data['history'].append({'kind':'workflow','at':now,'from':previous,'to':args.state,'note':args.note})
        data['updated_at'] = now
    validate(data)
    if args.command in ['update','workflow']:
        atomic_write(args.source, json.dumps(data, indent=2, ensure_ascii=False)+'\n')
    if args.command == 'validate':
        print(json.dumps({'valid':True,'items':sum(len(g['items']) for g in data['groups'])}))
    else:
        print(json.dumps(render_checklist(data,args.output,args.report_name)))


if __name__ == '__main__':
    main()
