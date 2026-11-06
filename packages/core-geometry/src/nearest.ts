import { derivative, evaluate, secondDerivative, type Segment } from './segment';
import { distance, dot, sub, type Vec2 } from './vec';

export interface NearestResult {
  /** Parameter of the closest point, in [0, 1]. */
  readonly t: number;
  readonly point: Vec2;
  readonly distance: number;
}

/**
 * Intervals scanned for sign changes of the closest-point condition. A cubic has at most
 * 3 local minima, so 64 intervals only miss a minimum that sits right next to a maximum.
 */
const INTERVALS = 64;

const result = (s: Segment, p: Vec2, t: number): NearestResult => {
  const point = evaluate(s, t);
  return { t, point, distance: distance(point, p) };
};

/**
 * f(t) = (B(t) - p) . B'(t). It is zero where the distance to p is stationary,
 * and changes from negative to positive at a local minimum.
 */
const condition = (s: Segment, p: Vec2, t: number): number =>
  dot(sub(evaluate(s, t), p), derivative(s, t));

/**
 * Root of the condition in [lo, hi], normally negative at lo and positive at hi.
 * Newton steps, falling back to bisection whenever a step would leave the bracket.
 * Without a sign change it settles on lo or hi, which is harmless: the caller keeps the best.
 */
const refine = (s: Segment, p: Vec2, lo: number, hi: number): number => {
  let t = (lo + hi) / 2;
  for (let i = 0; i < 60; i++) {
    const f = condition(s, p, t);
    if (f < 0) lo = t;
    else hi = t;
    const d = derivative(s, t);
    const slope = dot(d, d) + dot(sub(evaluate(s, t), p), secondDerivative(s, t));
    let next = slope > 0 ? t - f / slope : (lo + hi) / 2;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - t) < 1e-15) return next;
    t = next;
  }
  return t;
};

/** The closest point on the segment to `p`. */
export const nearestPoint = (s: Segment, p: Vec2): NearestResult => {
  if (s.kind === 'line') {
    const d = sub(s.p1, s.p0);
    const lengthSquared = dot(d, d);
    const t =
      lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, s.p0), d) / lengthSquared));
    return result(s, p, t);
  }
  // The end points are always candidates; interior minima are found by scanning the condition.
  let best = result(s, p, 0);
  const end = result(s, p, 1);
  if (end.distance < best.distance) best = end;
  let previousT = 0;
  let previousF = condition(s, p, 0);
  for (let i = 1; i <= INTERVALS; i++) {
    const t = i / INTERVALS;
    const f = condition(s, p, t);
    // A minimum sits where the condition goes from negative to positive. The first and last
    // intervals are always refined too: at an end point with a zero-length handle, B' is zero
    // and rounding can give the condition the wrong sign.
    if ((previousF < 0 && f >= 0) || i === 1 || i === INTERVALS) {
      const candidate = result(s, p, refine(s, p, previousT, t));
      if (candidate.distance < best.distance) best = candidate;
    }
    previousT = t;
    previousF = f;
  }
  return best;
};
