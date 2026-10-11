#!/usr/bin/env python3
"""Independent mux/source and decoded-tail proof for the off-screen sparse kit."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--evidence',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
if args.output.exists():raise ValueError('Fresh output required; preserve prior evidence')
spec=importlib.util.spec_from_file_location('journal',Path(__file__).with_name('verify-journal.py'));j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)
records=json.loads((args.evidence/'proof.json').read_text());proofs={};errors=[]
for name in ['resumed','endpoint','budget','clock-gap','backpressure']:
 r=records[name];proof,_,_,encoded=j.verify(Path(r['source_packet']['path']),Path(r['video']['path']));proofs[name]=proof
 if not proof['passed'] or proof['journal_lost_rows']!=0:errors.append(name+': mux/source correspondence failed')
 if name!='endpoint':continue
 end=2_000_000_000;bad=[e['encoded_sequence'] for e in encoded if int(e['relative_ns'])>=end]
 decoded=subprocess.run(['ffmpeg','-v','error','-i',r['video']['path'],'-vf','scale=1:1:flags=area','-pix_fmt','gray','-fps_mode','passthrough','-f','rawvideo','-'],capture_output=True,check=True,timeout=30)
 proof['endpoint_or_later_packets']=bad;proof['decoded_frame_count']=len(decoded.stdout);proof['decoded_tail_gray']=decoded.stdout[-1] if decoded.stdout else None
 proof['expected_tail_gray']=100;proof['tail_source_frame']=encoded[-1]['source_frame'] if encoded else None
 if bad:errors.append('endpoint: accepted sample has no interval before exclusive end')
 if len(decoded.stdout)!=len(encoded) or not decoded.stdout or abs(decoded.stdout[-1]-100)>3:errors.append('endpoint: decoded tail is not last admitted source')
 if not encoded or encoded[-1]['source_frame']!=1:errors.append('endpoint: final padding references unadmitted endpoint source')
summary={'schema':'sparse-finalization-qualification/v1','passed':not errors,'errors':errors,'cases':proofs,'limits':['Controlled off-screen32px buffers and actual AVAssetWriter; no UI or physical presentation latency.','Endpoint exclusion is a half-open media rule; minimal pre-fix case need not reproduce every full-resolution mux omission.','Deliberate unpadded diagnostic case is excluded from healthy mux assertions; its native error-chain test remains separate.']}
args.output.write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'passed':summary['passed'],'errors':errors,'cases':{n:{'decisions':r['encoded_decisions'],'packets':r['actual_muxed_packets'],'tail_gray':r.get('decoded_tail_gray')} for n,r in proofs.items()}}));raise SystemExit(0 if summary['passed'] else 1)
