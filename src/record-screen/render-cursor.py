#!/usr/bin/env python3
"""Streaming bounded SDR cursor compositor. Source fd3 stays opened by service."""
import json, os, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw
import cairosvg

def read_exact(stream,n):
    data=bytearray()
    while len(data)<n:
        piece=stream.read(n-len(data))
        if not piece:raise ValueError('Decoder ended before the selected actual source frame')
        data.extend(piece)
    return bytes(data)

def main(job):
    root=Path(job['output']);r=job['recipe'];t=job['timeline'];sw,sh=t['source_pixels'];ow,oh=t['output_pixels']
    asset=Path(job['asset_path']);png=root/'asset.png'
    if asset.suffix=='.svg':cairosvg.svg2png(url=str(asset),write_to=str(png))
    else:png=asset
    cursor=Image.open(png).convert('RGBA');aw,ah=cursor.size
    if not 0<=r['hotspot'][0]<aw or not 0<=r['hotspot'][1]<ah:raise ValueError('Hotspot outside original asset')
    width=max(1,round(r['size_px']));height=max(1,round(ah*width/aw));cursor=cursor.resize((width,height),Image.Resampling.LANCZOS)
    cursor.putalpha(cursor.getchannel('A').point(lambda a:round(a*r['opacity'])))
    hx,hy=r['hotspot'][0]*width/aw,r['hotspot'][1]*height/ah
    out=root/'cursor.mp4';dec=None;enc=None
    visible=[f['output_frame'] for f in t['frames'] if f['pointer']]
    clicks=[f['output_frame'] for f in t['frames'] if f['click']]
    samples=set([0,len(t['frames'])-1]+([visible[0],visible[len(visible)//2]] if visible else [])+([clicks[0]] if clicks else []));receipts=[]
    with (root/'decode.log').open('wb') as dl,(root/'encode.log').open('wb') as el:
      try:
        os.lseek(3,0,os.SEEK_SET)
        dec=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-i','/dev/fd/3','-map','0:v:0','-an','-vsync','0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=dl,pass_fds=(3,))
        enc=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{ow}x{oh}','-r',str(t['fps']),'-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast' if r['effort']=='draft' else 'medium','-crf','26' if r['effort']=='draft' else '18','-pix_fmt','yuv420p','-movflags','+faststart','-n',str(out)],stdin=subprocess.PIPE,stderr=el)
        current=-1;source=None
        for f in t['frames']:
          while current<f['source_frame_index']:
            source=read_exact(dec.stdout,sw*sh*3);current+=1
          image=Image.frombytes('RGB',(sw,sh),source).resize((ow,oh),Image.Resampling.LANCZOS).convert('RGBA')
          click=f['click']
          if click:
            overlay=Image.new('RGBA',(ow,oh));draw=ImageDraw.Draw(overlay);radius=8+18*click['progress'];x,y=click['x'],click['y'];draw.ellipse((x-radius,y-radius,x+radius,y+radius),outline=(29,170,220,round(180*(1-click['progress']))),width=2);image=Image.alpha_composite(image,overlay)
          pointer=f['pointer']
          if pointer:image.alpha_composite(cursor,(round(pointer['x']-hx),round(pointer['y']-hy)))
          image=image.convert('RGB');enc.stdin.write(image.tobytes())
          if f['output_frame'] in samples:
            path=root/f"sample-{f['output_frame']:04d}.png";image.save(path);receipts.append({'path':str(path),'output_frame':f['output_frame'],'source_frame_index':current,'pointer':pointer,'video_time_ns':f['video_time_ns']})
        enc.stdin.close()
        if enc.wait(timeout=30)!=0:raise ValueError('Encoder failed; inspect private encode.log')
      finally:
        for p in [dec,enc]:
          if p and p.poll() is None:
            p.terminate()
            try:p.wait(timeout=3)
            except subprocess.TimeoutExpired:p.kill();p.wait()
    receipt={'schema':'record-screen-cursor-render/v1','path':str(out),'frames':len(t['frames']),'fps':t['fps'],'size':t['output_pixels'],'effort':r['effort'],'samples':receipts,'output':str(root),'events_selected':t['events_selected'],'timing_qualification':t['timing_qualification'],'position_qualification':t['position_qualification']}
    (root/'render.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
if __name__=='__main__':main(json.load(sys.stdin))
