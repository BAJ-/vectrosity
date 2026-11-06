import { controlPoints, evaluate, endPoint, type Segment } from './segment';
import { insideUnitInterval, solveQuadratic } from './roots';
import type { Vec2 } from './vec';

export interface Rect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const EMPTY_RECT: Rect = {
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
};

export const isEmptyRect = (r: Rect): boolean => r.minX > r.maxX || r.minY > r.maxY;

export const includePoint = (r: Rect, p: Vec2): Rect => ({
  minX: Math.min(r.minX, p.x),
  minY: Math.min(r.minY, p.y),
  maxX: Math.max(r.maxX, p.x),
  maxY: Math.max(r.maxY, p.y),
});

export const unionRect = (a: Rect, b: Rect): Rect => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/** Roots in (0, 1) of one coordinate's derivative, given that coordinate's control values. */
const axisExtrema = (v: readonly number[]): number[] => {
  if (v.length === 3) {
    const [p0 = 0, p1 = 0, p2 = 0] = v;
    const denom = p0 - 2 * p1 + p2;
    return denom === 0 ? [] : insideUnitInterval([(p0 - p1) / denom]);
  }
  if (v.length === 4) {
    const [p0 = 0, p1 = 0, p2 = 0, p3 = 0] = v;
    const d0 = p1 - p0;
    const d1 = p2 - p1;
    const d2 = p3 - p2;
    return insideUnitInterval(solveQuadratic(d0 - 2 * d1 + d2, 2 * (d1 - d0), d0));
  }
  return [];
};

/** Parameters t in (0, 1) where the segment turns in x or in y, sorted and de-duplicated. */
export const extrema = (s: Segment): number[] => {
  const pts = controlPoints(s);
  const ts = [...axisExtrema(pts.map((p) => p.x)), ...axisExtrema(pts.map((p) => p.y))];
  return [...new Set(ts)].sort((a, b) => a - b);
};

/** The tight axis-aligned bounding box of the segment (not of its control points). */
export const segmentBounds = (s: Segment): Rect => {
  let r = includePoint(includePoint(EMPTY_RECT, s.p0), endPoint(s));
  for (const t of extrema(s)) r = includePoint(r, evaluate(s, t));
  return r;
};

export const segmentsBounds = (segments: readonly Segment[]): Rect =>
  segments.reduce((r, s) => unionRect(r, segmentBounds(s)), EMPTY_RECT);
