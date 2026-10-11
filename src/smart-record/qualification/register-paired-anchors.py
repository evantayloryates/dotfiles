#!/usr/bin/env python3
"""Bounded, offline anchor-registration experiment. Never modifies source maps.

Use the bundled Python/NumPy runtime. Images are retained source-QA frames;
caller-selected desktop regions and same-scale metadata are hypotheses.
A candidate is not clock calibration, pixel ownership or production readiness.
"""
import argparse
import json
import math
import os
import stat
from pathlib import Path
import warnings
from PIL import Image
import numpy as np

MAX_IMAGE_PIXELS = 8_000_000
MAX_SEARCH_PIXELS = 1_000_000
MAX_FFT_PIXELS = 2_097_152


def finite_number(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def bounded_image(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= 32*1024*1024:
            raise ValueError('bounded regular image required')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                image = Image.open(stream)
                if image.width*image.height > MAX_IMAGE_PIXELS:
                    raise ValueError('image pixel budget exceeded')
                image.load()
                return image.convert('RGB')
    finally:
        os.close(fd)


def gray(image):
    rgb = np.asarray(image, dtype=np.float32)
    return rgb.mean(axis=2)


def sums(array, height, width):
    integral = np.pad(array.astype(np.float64).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return integral[height:, width:] - integral[:-height, width:] - integral[height:, :-width] + integral[:-height, :-width]


def match(image, template):
    """NCC across all fully contained positions; no mutation or subprocess."""
    H, W = image.shape; h, w = template.shape
    if image.size > MAX_SEARCH_PIXELS or not 16 <= h <= 256 or not 16 <= w <= 512 or h > H or w > W:
        return {'available': False, 'reason': 'search_or_anchor_budget'}
    centered = template.astype(np.float64) - template.mean(dtype=np.float64)
    energy = float((centered*centered).sum())
    if energy/(h*w) < 100:
        return {'available': False, 'reason': 'anchor_texture_insufficient'}
    shape = tuple(1 << (n-1).bit_length() for n in (H+h-1, W+w-1))
    if math.prod(shape) > MAX_FFT_PIXELS:
        return {'available': False, 'reason': 'fft_budget'}
    # Owned temporary arrays; release each anchor before the next search.
    numerator = np.fft.irfft2(np.fft.rfft2(image, s=shape)*np.fft.rfft2(centered[::-1, ::-1], s=shape), s=shape)[h-1:H, w-1:W]
    mean_sum = sums(image, h, w)
    variance = np.maximum(0, sums(image.astype(np.float64)**2, h, w)-mean_sum**2/(h*w))
    denominator = np.sqrt(variance*energy)
    score = np.divide(numerator, denominator, out=np.full(numerator.shape, -1.0), where=denominator > 1e-6)
    score = np.clip(score, -1, 1)
    y, x = np.unravel_index(np.argmax(score), score.shape)
    best = float(score[y, x])
    score[max(0,y-5):y+6, max(0,x-5):x+6] = -1
    alternative = float(score.max())
    return {'available': True, 'location_px': [int(x), int(y)], 'score': best,
            'alternative_score': alternative, 'peak_margin': best-alternative,
            'template_pixels': [w, h], 'search_positions': int(score.size), 'fft_pixels': math.prod(shape)}


def match_rgb(image, template):
    """Per-channel-centered RGB NCC; sequential FFTs preserve the cell budget."""
    H, W, channels = image.shape; h, w, other = template.shape
    if channels != 3 or other != 3:
        raise ValueError('RGB arrays required')
    if H*W > MAX_SEARCH_PIXELS or not 16 <= h <= 256 or not 16 <= w <= 512 or h > H or w > W:
        return {'available': False, 'reason': 'search_or_anchor_budget'}
    centered = template.astype(np.float64) - template.mean(axis=(0,1), dtype=np.float64)
    energy = float((centered*centered).sum())
    if energy/(h*w*3) < 100:
        return {'available': False, 'reason': 'anchor_texture_insufficient'}
    shape = tuple(1 << (n-1).bit_length() for n in (H+h-1, W+w-1))
    if math.prod(shape) > MAX_FFT_PIXELS:
        return {'available': False, 'reason': 'fft_budget'}
    numerator = np.zeros((H-h+1,W-w+1),dtype=np.float64)
    variance = np.zeros_like(numerator)
    for channel in range(3):
        plane = image[:,:,channel]
        numerator += np.fft.irfft2(np.fft.rfft2(plane,s=shape)*np.fft.rfft2(centered[::-1,::-1,channel],s=shape),s=shape)[h-1:H,w-1:W]
        mean_sum = sums(plane,h,w)
        variance += np.maximum(0,sums(plane.astype(np.float64)**2,h,w)-mean_sum**2/(h*w))
    denominator = np.sqrt(variance*energy)
    score = np.divide(numerator,denominator,out=np.full(numerator.shape,-1.0),where=denominator>1e-6)
    score = np.clip(score,-1,1)
    y,x = np.unravel_index(np.argmax(score),score.shape);best=float(score[y,x])
    score[max(0,y-5):y+6,max(0,x-5):x+6]=-1
    return {'available':True,'location_px':[int(x),int(y)],'score':best,
            'alternative_score':float(score.max()),'peak_margin':best-float(score.max()),
            'template_pixels':[w,h],'search_positions':int(score.size),'fft_pixels':math.prod(shape),'channels':3}


def register(primary, backup, primary_scale, backup_affine, anchors, sampling='single', feature_mode='gray'):
    if feature_mode not in ('gray', 'rgb'):
        raise ValueError('feature_mode must be gray or rgb')
    if sampling not in ('single', 'quarter_phase'):
        raise ValueError('sampling must be single or quarter_phase')
    if not finite_number(primary_scale) or not .05 <= primary_scale <= 8:
        raise ValueError('bounded positive primary pixels-per-desktop-point required')
    if not isinstance(backup_affine, list) or len(backup_affine) != 6 or not all(finite_number(v) for v in backup_affine):
        raise ValueError('finite backup affine required')
    a, b, c, d, tx, ty = backup_affine
    if b != 0 or c != 0 or not .05 <= a <= 8 or not .05 <= d <= 8 or abs(a-d) > 1e-9:
        raise ValueError('only positive isotropic axis-aligned backup supported')
    if not isinstance(anchors, list) or not 2 <= len(anchors) <= 4:
        raise ValueError('two to four explicit independent anchors required')
    for anchor in anchors:
        if not isinstance(anchor, dict) or set(anchor) != {'id','x','y','w','h'} or not isinstance(anchor['id'],str) or not 1 <= len(anchor['id']) <= 128 or not all(finite_number(anchor[k]) for k in ['x','y','w','h']) or anchor['w'] <= 0 or anchor['h'] <= 0:
            raise ValueError('explicit finite positive anchor region required')
    if primary.width*primary.height > MAX_SEARCH_PIXELS or backup.width*backup.height > MAX_IMAGE_PIXELS:
        raise ValueError('source pixel budget exceeded')
    if primary.mode != 'RGB' or backup.mode != 'RGB':
        raise ValueError('RGB source images required')
    results = []; image = gray(primary) if feature_mode == 'gray' else np.asarray(primary,dtype=np.float32)
    for anchor in anchors:
        x,y,w,h = (anchor[k] for k in ['x','y','w','h'])
        box = (a*x+tx, d*y+ty, a*(x+w)+tx, d*(y+h)+ty)
        if box[0] < 0 or box[1] < 0 or box[2] > backup.width or box[3] > backup.height:
            results.append({'id':anchor['id'],'desktop_anchor':anchor,'available':False,'reason':'backup_anchor_clipped'});continue
        size = (round(primary_scale*w), round(primary_scale*h))
        if not 16 <= size[0] <= 512 or not 16 <= size[1] <= 256 or size[0] > primary.width or size[1] > primary.height:
            results.append({'id':anchor['id'],'desktop_anchor':anchor,'available':False,'reason':'search_or_anchor_budget'});continue
        # Default extent/cursor behavior stays unchanged. Optional phase trials
        # preserve the declared scale instead of rounding a region into a new density.
        phases = (0,) if sampling == 'single' else (0,.25,.5,.75)
        methods = ('rounded_region_extent',) if sampling == 'single' else ('rounded_region_extent','exact_density_extent')
        trials = []; sampled_bounds = [x,y,x+w,y+h]
        for method in methods:
            for px in phases:
                for py in phases:
                    sx,sy = x+px/primary_scale,y+py/primary_scale
                    sw,sh = (w,h) if method == 'rounded_region_extent' else (size[0]/primary_scale,size[1]/primary_scale)
                    trial_box = (a*sx+tx,d*sy+ty,a*(sx+sw)+tx,d*(sy+sh)+ty)
                    if trial_box[2] > backup.width or trial_box[3] > backup.height:
                        trials.append({'available':False,'reason':'backup_anchor_clipped'});continue
                    sampled_bounds[2] = max(sampled_bounds[2],sx+sw);sampled_bounds[3] = max(sampled_bounds[3],sy+sh)
                    template = backup.transform(size, Image.Transform.EXTENT, trial_box, Image.Resampling.BICUBIC)
                    trial = match(image,gray(template)) if feature_mode == 'gray' else match_rgb(image,np.asarray(template,dtype=np.float32))
                    if trial['available']:
                        trial['translation_candidate_px'] = [trial['location_px'][0]-primary_scale*sx,trial['location_px'][1]-primary_scale*sy]
                        if sampling != 'single':trial.update(sampling_method=method,template_phase_px=[px,py])
                    trials.append(trial)
        available = [t for t in trials if t['available']]
        # Select by score, then apply the unchanged ambiguity/quality gates.
        # Do not choose a lower-score false location just because its margin passes.
        best = max(available,key=lambda t:t['score']) if available else trials[0]
        result = {'id':anchor['id'], 'desktop_anchor':anchor, **best}
        if sampling != 'single':
            result.update(sampling_trials=len(trials),available_sampling_trials=len(available),sampled_desktop_bounds=sampled_bounds)
        results.append(result)
    reasons=[]
    if not all(r['available'] for r in results):reasons.append('anchor_unavailable')
    if any(r.get('score',-1) < .8 for r in results):reasons.append('anchor_match_weak')
    if any(r.get('peak_margin',0) < .1 for r in results):reasons.append('anchor_match_ambiguous')
    if len({r['id'] for r in results}) != len(results):reasons.append('anchor_ids_duplicate')
    if any(min(p['x']+p['w'],q['x']+q['w']) > max(p['x'],q['x']) and min(p['y']+p['h'],q['y']+q['h']) > max(p['y'],q['y']) for i,p in enumerate(anchors) for q in anchors[i+1:]):
        reasons.append('anchors_overlap')
    sampled = [r.get('sampled_desktop_bounds') for r in results]
    if sampling != 'single' and any(min(p[2],q[2]) > max(p[0],q[0]) and min(p[3],q[3]) > max(p[1],q[1]) for i,p in enumerate(sampled) if p for q in sampled[i+1:] if q):
        reasons.append('anchor_sampling_extents_overlap')
    centers = [(r['desktop_anchor']['x']+r['desktop_anchor']['w']/2,r['desktop_anchor']['y']+r['desktop_anchor']['h']/2) for r in results if 'desktop_anchor' in r]
    separated = len(centers)==len(results) and max(math.dist(p,q)*primary_scale for p in centers for q in centers) >= 64
    if not separated:reasons.append('anchors_not_spatially_separated')
    translations=[r['translation_candidate_px'] for r in results if r['available']]
    spread = max(max(t[axis]for t in translations)-min(t[axis]for t in translations) for axis in [0,1]) if translations else None
    if spread is None or spread > 2:reasons.append('anchors_disagree')
    available=not reasons
    fitted = [primary_scale,0,0,primary_scale,*[sum(t[axis]for t in translations)/len(translations) for axis in [0,1]]] if available else None
    output = {'schema':'offline-paired-anchor-registration/v1','candidate_transform_available':available,
            'candidate_desktop_to_primary_pixels':fitted,'reasons':reasons,'anchors':results,
            'translation_spread_px':spread,'qualification':'spatial_candidate_only; timing/provenance and held-out pixel verification required',
            'production_source_map_changed':False,
            'limits':['Explicit anchor regions and scales are caller hypotheses; no automatic subject/actor ownership.',
                      'Matching texture and two agreeing anchors do not prove full-frame or continuous alignment.',
                      'Legacy/different-process clocks remain unqualified; no provenance backfill.',
                      'Only positive isotropic translation is supported; no fitted union or occluded/missing content invented.']}
    if feature_mode != 'gray':
        output['feature_mode'] = feature_mode
        output['limits'].append('RGB NCC keeps channel differences but does not establish colorimetric fidelity or calibrated match probabilities; three sequential channel correlations per trial (two forward FFTs and one inverse FFT per channel).')
    if sampling != 'single':
        output.update(sampling=sampling,max_sampling_trials_per_anchor=32)
        output['limits'].append('Phase/density hypotheses are bounded; trial-crop extents must remain independent. Match scores are not calibrated probabilities.')
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('config',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    fd=os.open(args.config,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= 65536:raise ValueError('bounded regular config required')
        with os.fdopen(fd,'rb',closefd=False) as stream:
            content=stream.read(65537)
            if len(content)>65536:raise ValueError('config grew beyond byte budget')
            config=json.loads(content)
    finally:os.close(fd)
    required={'primary_image','backup_image','primary_scale','backup_affine','anchors'}
    if not isinstance(config,dict) or not required <= set(config) or not set(config) <= required | {'sampling','feature_mode'}:raise ValueError('explicit images, scale, affine and anchors required')
    if any(not isinstance(config[k],str) or not Path(config[k]).is_absolute() for k in ['primary_image','backup_image']):raise ValueError('absolute source paths required')
    if args.output.exists() or args.output.is_symlink():raise ValueError('fresh output required')
    if config.get('sampling','single') not in ('single','quarter_phase'):raise ValueError('sampling must be single or quarter_phase')
    if config.get('feature_mode','gray') not in ('gray','rgb'):raise ValueError('feature_mode must be gray or rgb')
    result=register(bounded_image(config['primary_image']),bounded_image(config['backup_image']),config['primary_scale'],config['backup_affine'],config['anchors'],config.get('sampling','single'),config.get('feature_mode','gray'))
    fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream:stream.write(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'available':result['candidate_transform_available'],'reasons':result['reasons'],'anchors':[{k:r.get(k)for k in ['id','score','peak_margin','translation_candidate_px']}for r in result['anchors']]}))


if __name__=='__main__':main()
