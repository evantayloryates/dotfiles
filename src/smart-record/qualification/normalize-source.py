#!/usr/bin/env python3
"""Qualification-only source packet: normalize clocks/geometry at the producer.

No UI/input capture and no semantic classification. Legacy rect strings are
accepted only for this kit's earlier outputs. No production service is changed.
"""
import argparse
import json
import math
import re
import statistics
from pathlib import Path


def rectangle(value):
    if isinstance(value, dict) and all(k in value for k in ('x', 'y', 'w', 'h')):
        result = {k: float(value[k]) for k in ('x', 'y', 'w', 'h')}
    elif isinstance(value, str):
        fields = dict(re.findall(r'(X|Y|Width|Height)\s*=\s*"?([-+0-9.eE]+)', value))
        if len(fields) != 4:
            return None
        result = {k: float(fields[v]) for k, v in [('x', 'X'), ('y', 'Y'), ('w', 'Width'), ('h', 'Height')]}
    else:
        return None
    return result if all(math.isfinite(v) for v in result.values()) else None


def build(stream, actions, input_log, receipt):
    source = stream['frames']
    if not source:
        raise ValueError('source has no frames; capture cannot be declared ready')
    epoch = round(source[0]['pts_ns'])
    frames, segments = [], []
    previous = None
    for sequence, raw in enumerate(source):
        screen, content = rectangle(raw.get('screen_rect')), rectangle(raw.get('content_rect'))
        scale, shrink = raw.get('scale_factor'), raw.get('content_scale')
        geometry = {'screen_points': screen, 'content_points': content,
                    'scale_factor': scale, 'content_scale': shrink, 'encoded_pixels': raw.get('pixels')}
        identity = json.dumps(geometry, sort_keys=True)
        if identity != previous:
            matrix = None
            if screen and content and scale and shrink:
                factor = scale * shrink
                matrix = [factor, 0, 0, factor,
                          content['x'] * scale - screen['x'] * factor,
                          content['y'] * scale - screen['y'] * factor]
            segments.append({'id': len(segments), 'first_frame': sequence,
                             'start_relative_ns': round(raw['pts_ns']) - epoch,
                             'geometry': geometry, 'desktop_points_to_encoded_pixels': matrix,
                             'qualification': 'Candidate SCK transform; checked against authored fixture pixels only'})
            previous = identity
        row = {'sequence': sequence, 'relative_ns': round(raw['pts_ns']) - epoch,
               'status': raw.get('status'), 'geometry_segment': segments[-1]['id'],
               'callback_lag_ns': round(raw['received_ns'] - raw['pts_ns'])}
        for key in ('evidence_png', 'marker', 'marker_counts'):
            if key in raw:
                row[key] = raw[key]
        frames.append(row)
    complete = [f for f in frames if f['status'] == 0]
    alignment = []
    for action in actions:
        if action.get('fixture_pid') != receipt['target']['pid'] or action.get('window_id') != stream['window_id']:
            raise ValueError('fixture identity changed; do not combine this evidence')
        when = action['host_ns'] - epoch
        if action.get('action') != 'marker' or not complete or not complete[0]['relative_ns'] <= when <= complete[-1]['relative_ns']:
            continue
        frame = next((f for f in complete if f['relative_ns'] >= when and f.get('marker') == action['marker']), None)
        alignment.append({'fixture_sequence': action['sequence'], 'marker': action['marker'],
                          'handled_relative_ns': when, 'first_matching_frame': frame['sequence'] if frame else None,
                          'handle_to_pixel_ms': (frame['relative_ns'] - when) / 1e6 if frame else None})
    events = []
    for event in input_log.get('events', []):
        host = event.get('timestamp_ns', event.get('uptime_ns'))
        if host is None:
            continue
        reasons = []
        if event.get('target_pid') == receipt['target']['pid']:
            reasons.append('explicit_target_delivery')
        if receipt['dispatch_interval_host_ns'][0] <= host <= receipt['dispatch_interval_host_ns'][1]:
            reasons.append('within_declared_action_block')
        events.append({**event, 'relative_ns': host - epoch, 'relevance_reasons': reasons,
                       'origin': 'unknown', 'ownership': 'Receipt corroboration only; no automatic agent identity',
                       'position_for_composition': None,
                       'position_limit': 'Raw event coordinates retained; injected-input coordinate semantics are not qualified'})
    latencies = [x['handle_to_pixel_ms'] for x in alignment if x['handle_to_pixel_ms'] is not None]
    return {'schema': 'capture-qualification-source/v1', 'epoch_host_ns': epoch,
            'clock': {'domain': 'host uptime nanoseconds', 'precision_limit_ns': 1,
                      'limit': 'No physical-input or dispatch-to-pixel guarantee; no sleep/display-transition qualification'},
            'window_id': stream['window_id'], 'capture_options': stream.get('options', {}),
            'geometry_segments': segments, 'frames': frames, 'input_events': events,
            'action_receipts': [receipt], 'marker_alignment': alignment,
            'qa': {'complete_frames': len(complete), 'source_frames': len(frames),
                   'png_write_errors': stream.get('evidence_errors'),
                   'png_skipped_for_capacity': stream.get('evidence_skipped'),
                   'matched_markers': len(latencies), 'unmatched_markers': len(alignment) - len(latencies),
                   'handle_to_pixel_ms': {'min': min(latencies), 'median': statistics.median(latencies), 'max': max(latencies)} if latencies else None,
                   'input_gaps': input_log.get('tap_disables_or_capacity_overflows'),
                   'limit': 'Complete status alone does not prove nonblank pixels. No drop count inferred from frame spacing.'}}


def main():
    parser = argparse.ArgumentParser()
    for name in ('stream', 'actions', 'input', 'receipt', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    actions = [json.loads(line) for line in args.actions.read_text().splitlines() if line]
    packet = build(json.loads(args.stream.read_text()), actions, json.loads(args.input.read_text()), json.loads(args.receipt.read_text()))
    args.output.write_text(json.dumps(packet, indent=2))
    print(json.dumps({'output': str(args.output), 'qa': packet['qa'], 'geometry_segments': len(packet['geometry_segments'])}))


if __name__ == '__main__':
    main()
