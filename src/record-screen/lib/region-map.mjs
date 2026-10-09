// Continuous geometric coverage of declared desktop rectangles. No pixels,
// UI discovery, semantic visibility or actor ownership are inferred.
import { EngineError } from './client.mjs';

export const MAX_REGIONS = 16;
export const regionSchema = {
  type: 'array', maxItems: MAX_REGIONS, items: {
    type: 'object', additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]*$' },
      x: { type: 'number', minimum: -1e7, maximum: 1e7 },
      y: { type: 'number', minimum: -1e7, maximum: 1e7 },
      w: { type: 'number', exclusiveMinimum: 0, maximum: 1e7 },
      h: { type: 'number', exclusiveMinimum: 0, maximum: 1e7 },
    }, required: ['id', 'x', 'y', 'w', 'h'],
  }, description: 'Up to16 uniquely named caller-declared desktop-point rectangles. Geometry coverage does not prove that their content was captured.',
};
export function validateRegions(regions = []) {
  const ids = new Set();
  if (!Array.isArray(regions) || regions.length > MAX_REGIONS || regions.some(r => {
    if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).length !== 5 ||
        Object.keys(r).some(k => !['id','x','y','w','h'].includes(k)) ||
        typeof r.id !== 'string' || r.id.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(r.id) || ids.has(r.id) ||
        !['x','y','w','h'].every(k => Number.isFinite(r[k]) && Math.abs(r[k]) <= 1e7) || r.w <= 0 || r.h <= 0) return true;
    ids.add(r.id); return false;
  })) throw new EngineError('bad_frame_map', 'desktop_regions requires0–16 unique ids and finite bounded x/y/positive w/h; no unknown fields.');
  return regions;
}

function area(polygon) {
  // Translate to the first vertex to avoid cancellation for desktop offsets.
  if (polygon.length < 3) return 0;
  const [o, ...p] = polygon;
  let sum = 0;
  for (let i = 0; i+1 < p.length; i++) sum += (p[i].x-o.x)*(p[i+1].y-o.y) - (p[i].y-o.y)*(p[i+1].x-o.x);
  return Math.abs(sum)/2;
}
function clip(polygon, axis, bound, lower) {
  const inside = p => lower ? p[axis] >= bound : p[axis] <= bound;
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i+1)%polygon.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (bound-a[axis])/(b[axis]-a[axis]);
      out.push({ x: axis === 'x' ? bound : a.x+t*(b.x-a.x),
        y: axis === 'y' ? bound : a.y+t*(b.y-a.y) });
    }
  }
  return out;
}
export function projectRegions(regions, matrix, pixels) {
  const [a,b,c,d,tx,ty] = matrix, [width,height] = pixels;
  return regions.map(r => {
    const quad = [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]]
      .map(([x,y]) => ({ x:a*x+c*y+tx, y:b*x+d*y+ty }));
    let clipped = quad;
    for (const [axis,bound,lower] of [['x',0,true],['x',width,false],['y',0,true],['y',height,false]]) clipped = clip(clipped,axis,bound,lower);
    const totalArea = area(quad), clippedArea = area(clipped);
    if (![...quad,...clipped].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
        !Number.isFinite(totalArea) || totalArea <= 0 || !Number.isFinite(clippedArea)) {
      throw new EngineError('frame_mapping', 'Projected region is numerically unresolvable; no spatial coverage claimed.');
    }
    const contained = quad.every(p => p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height);
    return {
      id:r.id, desktop_rect:{x:r.x,y:r.y,w:r.w,h:r.h}, source_quad:quad,
      source_bounds:{x:Math.min(...quad.map(p=>p.x)),y:Math.min(...quad.map(p=>p.y)),
        w:Math.max(...quad.map(p=>p.x))-Math.min(...quad.map(p=>p.x)),
        h:Math.max(...quad.map(p=>p.y))-Math.min(...quad.map(p=>p.y))},
      canvas_pixels:{w:width,h:height}, clipped_polygon:clipped,
      canvas_relation:contained ? 'contained' : clippedArea > 0 ? 'clipped' : 'outside',
      canvas_area_fraction:contained ? 1 : Math.min(1,Math.max(0,clippedArea/totalArea)),
      content_presence:'unverified',
    };
  });
}
