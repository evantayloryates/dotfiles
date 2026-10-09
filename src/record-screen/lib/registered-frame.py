#!/usr/bin/env python3
"""Owned fd decoder and bounded image registration worker. No capture or UI."""
import fcntl
import stat
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import sys
import time
from fractions import Fraction


def decode(ffmpeg, fd, index, dimensions, expected_time):
    from PIL import Image
    command=[ffmpeg,'-hide_banner','-loglevel','info','-threads','1','-copyts','-i',f'/dev/fd/{fd}',
             '-map','0:v:0','-vf',f'select=eq(n\\,{index}),showinfo','-frames:v','1','-fps_mode','passthrough',
             '-f','image2pipe','-c:v','png','pipe:1']
    child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=(fd,))
    output=bytearray();diagnostics=bytearray();until=time.monotonic()+12
    try:
        with selectors.DefaultSelector() as selector:
            for stream in [child.stdout,child.stderr]:os.set_blocking(stream.fileno(),False);selector.register(stream,selectors.EVENT_READ)
            while selector.get_map():
                if time.monotonic()>until:raise ValueError('owned_decoder_deadline')
                for key,_ in selector.select(min(.1,max(0,until-time.monotonic()))):
                    data=os.read(key.fileobj.fileno(),65536)
                    if not data:selector.unregister(key.fileobj);continue
                    destination=output if key.fileobj is child.stdout else diagnostics
                    destination.extend(data)
                    if len(destination)>(32*1024*1024 if destination is output else 32768):raise ValueError('owned_decoder_output_budget')
        if child.wait(timeout=1)!=0:raise ValueError('owned_decoder_failed')
        text=diagnostics.decode('utf-8',errors='replace')
        bases=re.findall(r'config in time_base:\s*(\d+)/(\d+)',text)
        pts=re.findall(r'\bn:\s*\d+\s+pts:\s*(-?\d+)\s+pts_time:',text)
        if len(bases)!=1 or len(pts)!=1:raise ValueError('decoded_frame_timestamp_unavailable')
        value=Fraction(int(pts[0])*int(bases[0][0])*1_000_000_000,int(bases[0][1]))
        if value!=Fraction(int(expected_time['numerator']),int(expected_time['denominator'])):raise ValueError('decoded_frame_timestamp_mismatch')
        with Image.open(io.BytesIO(output)) as image:
            if list(image.size)!=dimensions:raise ValueError('decoded_frame_dimensions_changed')
            image.load();rgb=image.convert('RGB')
        return rgb,{'frame_index':index,'frame_time_ns':{'numerator':str(value.numerator),'denominator':str(value.denominator)},
                    'pixels':dimensions,'decoded_rgb_sha256':hashlib.sha256(rgb.tobytes()).hexdigest()}
    finally:
        if child.poll() is None:child.kill()
        child.wait(timeout=2)
        child.stdout.close();child.stderr.close()


def verify_regions(primary,backup,scale,backup_affine,registered,regions):
    import numpy as np
    from PIL import Image
    observations=[]
    for region in regions:
        x,y,w,h=(region[k]for k in ['x','y','w','h']);size=(round(scale*w),round(scale*h))
        if not 16<=size[0]<=512 or not 16<=size[1]<=256:
            observations.append({'id':region['id'],'verified':False,'reason':'verification_patch_budget'});continue
        patches=[]
        for image,m in [(primary,registered),(backup,backup_affine)]:
            a,_,_,d,tx,ty=m;box=(a*x+tx,d*y+ty,a*(x+w)+tx,d*(y+h)+ty)
            if box[0]<0 or box[1]<0 or box[2]>image.width or box[3]>image.height:break
            patches.append(np.asarray(image.transform(size,Image.Transform.EXTENT,box,Image.Resampling.BICUBIC),dtype=np.float64))
        if len(patches)!=2:
            observations.append({'id':region['id'],'verified':False,'reason':'verification_patch_clipped'});continue
        centered=[p-p.mean(axis=(0,1))for p in patches];energies=[float((p*p).sum())for p in centered]
        if any(e/(size[0]*size[1]*3)<100 for e in energies):
            observations.append({'id':region['id'],'verified':False,'reason':'verification_texture_insufficient'});continue
        score=float((centered[0]*centered[1]).sum()/(energies[0]*energies[1])**.5)
        error=float(np.abs(patches[0]-patches[1]).mean()/255)
        observations.append({'id':region['id'],'verified':score>=.9 and error<=.1,'rgb_ncc':score,'normalized_mean_absolute_error':error,'patch_pixels':list(size)})
    return observations


def registration(config):
    images=[];identities=[]
    for lane in range(2):
        image,identity=decode(config['ffmpeg'],3+lane,config[['primary_index','backup_index'][lane]],config['dimensions'][lane],config['frame_times'][lane])
        images.append(image);identities.append(identity)
    spec=importlib.util.spec_from_file_location('anchors',Path(__file__).parent.parent/'qualification/register-paired-anchors.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    candidate=module.register(*images,config['primary_scale'],config['backup_affine'],config['anchors'],'quarter_phase','rgb')
    base={'decoded_frames':identities,'candidate':candidate,'production_source_map_changed':False}
    if not candidate['candidate_transform_available']:return {**base,'state':'unavailable','reason':'anchor_registration_refused'}
    matrix=candidate['candidate_desktop_to_primary_pixels']
    verification=verify_regions(*images,config['primary_scale'],config['backup_affine'],matrix,config['verification_regions'])
    base['independent_verification']=verification
    if not verification or not all(v['verified']for v in verification):return {**base,'state':'unavailable','reason':'independent_verification_refused'}
    return {**base,'state':'verified','registered_desktop_to_primary_pixels':matrix,
            'verification_thresholds':{'rgb_ncc_minimum':.9,'normalized_mean_absolute_error_maximum':.1},
            'qualification':'One exact decoded frame pair and caller-declared independent regions; not full-frame, continuous, physical or semantic ownership proof.'}

def main():
    raw=sys.stdin.buffer.read(65537)
    if len(raw)>65536:raise ValueError('worker_config_budget')
    config=json.loads(raw)
    fd=os.open(config['lease_path'],os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_NONBLOCK,0o600)
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1 or stat.S_IMODE(info.st_mode)&0o077:
            raise ValueError('registration_lock_unavailable')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'state':'unavailable','reason':'registration_busy'}
        return registration(config)
    finally:os.close(fd)


if __name__=='__main__':
    try:result=main()
    except ImportError:result={'state':'unavailable','reason':'registration_dependencies_unavailable'}
    except ValueError as error:
        code=str(error)
        safe={'owned_decoder_deadline','owned_decoder_output_budget','owned_decoder_failed','decoded_frame_timestamp_unavailable','decoded_frame_timestamp_mismatch','decoded_frame_dimensions_changed','worker_config_budget','registration_lock_unavailable'}
        result={'state':'unavailable','reason':code if code in safe else 'owned_decode_or_registration_failed'}
    except (OSError,KeyError,TypeError,subprocess.SubprocessError):result={'state':'unavailable','reason':'owned_decode_or_registration_failed'}
    print(json.dumps(result))
