#!/usr/bin/env python3
"""Independent retained offscreen muxed-timing and terminal-outcome proof."""
import argparse
from fractions import Fraction
import json
from pathlib import Path
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
if args.output.exists():parser.error('preserve existing proof; choose a new output filename')
proof=[]
for name in ['affected','peer','callback-first']:
 path=args.evidence/name
 rows=[json.loads(line) for line in (path/'source.jsonl').open()]
 encoded=[r for r in rows if r['kind']=='encoded_frame' and r['accepted']]
 footer=rows[-1]
 assert footer['kind']=='footer' and footer['complete'] and footer['rows_lost']==0
 response=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_packets','-show_entries','stream=time_base,width,height:packet=pts','-of','json',str(path/'video.mp4')],timeout=15))
 stream=response['streams'][0]
 assert (stream['width'],stream['height'])==(32,32),'authored offscreen fixture only'
 base=Fraction(stream['time_base'])
 actual=[Fraction(packet['pts'])*base*10**9 for packet in response['packets']]
 assert actual and actual==[int(row['relative_ns']) for row in encoded],'muxed time differs from accepted submissions'
 manifest=json.loads((path/'recording.json').read_text())
 outcome=manifest['source_packet']['video_outcome']
 assert manifest['state']==('done' if name=='peer' else 'interrupted')
 assert outcome['successful_finalization']==(name=='peer')
 assert footer['video_outcome']['successful_finalization']==(name=='peer')
 assert manifest['capture_quarantined'] is False and manifest['unfinished_work']['admission_held'] is False
 if name!='peer':assert manifest['frames_provenance']=='persisted_checkpoint_not_final'
 proof.append({'take':name,'state':manifest['state'],'muxed_packets':len(actual),'timestamps_exact':True,'timebase':str(base),'deadline_outcome_preserved':name!='peer','admission_released':True})
result={'passed':True,'takes':proof,'limits':['Authored 32x32 AVAssetWriter output; no screen, natural hardware hang, stalled stream stop or capacity guarantee','Late media finalized here; this does not guarantee future partial files decode']}
args.output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'takes':len(proof),'muxed_packets':sum(p['muxed_packets'] for p in proof)}))
