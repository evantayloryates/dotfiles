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


def register(primary, backup, primary_scale, backup_affine, anchors):
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
    results = []; image = gray(primary)
    for anchor in anchors:
        x,y,w,h = (anchor[k] for k in ['x','y','w','h'])
        box = (a*x+tx, d*y+ty, a*(x+w)+tx, d*(y+h)+ty)
        if box[0] < 0 or box[1] < 0 or box[2] > backup.width or box[3] > backup.height:
            results.append({'id':anchor['id'],'desktop_anchor':anchor,'available':False,'reason':'backup_anchor_clipped'});continue
        size = (round(primary_scale*w), round(primary_scale*h))
        if not 16 <= size[0] <= 512 or not 16 <= size[1] <= 256 or size[0] > primary.width or size[1] > primary.height:
            results.append({'id':anchor['id'],'desktop_anchor':anchor,'available':False,'reason':'search_or_anchor_budget'});continue
        # extent keeps fractional backup sampling rather than inventing a crop origin.
        template = backup.transform(size, Image.Transform.EXTENT, box, Image.Resampling.BICUBIC)
        result = {'id':anchor['id'], 'desktop_anchor':anchor, **match(image,gray(template))}
        if result['available']:
            result['translation_candidate_px'] = [result['location_px'][0]-primary_scale*x,result['location_px'][1]-primary_scale*y]
        results.append(result)
    reasons=[]
    if not all(r['available'] for r in results):reasons.append('anchor_unavailable')
    if any(r.get('score',-1) < .8 for r in results):reasons.append('anchor_match_weak')
    if any(r.get('peak_margin',0) < .1 for r in results):reasons.append('anchor_match_ambiguous')
    if len({r['id'] for r in results}) != len(results):reasons.append('anchor_ids_duplicate')
    if any(min(p['x']+p['w'],q['x']+q['w']) > max(p['x'],q['x']) and min(p['y']+p['h'],q['y']+q['h']) > max(p['y'],q['y']) for i,p in enumerate(anchors) for q in anchors[i+1:]):
        reasons.append('anchors_overlap')
    centers = [(r['desktop_anchor']['x']+r['desktop_anchor']['w']/2,r['desktop_anchor']['y']+r['desktop_anchor']['h']/2) for r in results if 'desktop_anchor' in r]
    separated = len(centers)==len(results) and max(math.dist(p,q)*primary_scale for p in centers for q in centers) >= 64
    if not separated:reasons.append('anchors_not_spatially_separated')
    translations=[r['translation_candidate_px'] for r in results if r['available']]
    spread = max(max(t[axis]for t in translations)-min(t[axis]for t in translations) for axis in [0,1]) if translations else None
    if spread is None or spread > 2:reasons.append('anchors_disagree')
    available=not reasons
    fitted = [primary_scale,0,0,primary_scale,*[sum(t[axis]for t in translations)/len(translations) for axis in [0,1]]] if available else None
    return {'schema':'offline-paired-anchor-registration/v1','candidate_transform_available':available,
            'candidate_desktop_to_primary_pixels':fitted,'reasons':reasons,'anchors':results,
            'translation_spread_px':spread,'qualification':'spatial_candidate_only; timing/provenance and held-out pixel verification required',
            'production_source_map_changed':False,
            'limits':['Explicit anchor regions and scales are caller hypotheses; no automatic subject/actor ownership.',
                      'Matching texture and two agreeing anchors do not prove full-frame or continuous alignment.',
                      'Legacy/different-process clocks remain unqualified; no provenance backfill.',
                      'Only positive isotropic translation is supported; no fitted union or occluded/missing content invented.']}


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
    allowed={'primary_image','backup_image','primary_scale','backup_affine','anchors'}
    if not isinstance(config,dict) or set(config)!=allowed:raise ValueError('explicit images, scale, affine and anchors required')
    if any(not isinstance(config[k],str) or not Path(config[k]).is_absolute() for k in ['primary_image','backup_image']):raise ValueError('absolute source paths required')
    if args.output.exists() or args.output.is_symlink():raise ValueError('fresh output required')
    result=register(bounded_image(config['primary_image']),bounded_image(config['backup_image']),config['primary_scale'],config['backup_affine'],config['anchors'])
    fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as stream:stream.write(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'available':result['candidate_transform_available'],'reasons':result['reasons'],'anchors':[{k:r.get(k)for k in ['id','score','peak_margin','translation_candidate_px']}for r in result['anchors']]}))


if __name__=='__main__':main()
