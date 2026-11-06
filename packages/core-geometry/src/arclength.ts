import { extrema } from './bounds';
import { derivative, type Segment } from './segment';
import { distance, length } from './vec';

/** 8-point Gauss-Legendre nodes and weights on [-1, 1]. */
const NODES = [
  -0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498,
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
];
const WEIGHTS = [
  0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362,
  0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
];

/** Gauss-Legendre estimate of the length of `s` between t0 and t1. */
const quadrature = (s: Segment, t0: number, t1: number): number => {
  const half = (t1 - t0) / 2;
  const mid = (t0 + t1) / 2;
  let sum = 0;
  for (let i = 0; i < NODES.length; i++) {
    sum += (WEIGHTS[i] ?? 0) * length(derivative(s, mid + half * (NODES[i] ?? 0)));
  }
  return sum * half;
};

const MAX_DEPTH = 20;

const adaptive = (
  s: Segment,
  t0: number,
  t1: number,
  whole: number,
  accuracy: number,
  depth: number,
): number => {
  const mid = (t0 + t1) / 2;
  const left = quadrature(s, t0, mid);
  const right = quadrature(s, mid, t1);
  if (Math.abs(left + right - whole) <= accuracy || depth >= MAX_DEPTH) return left + right;
  return (
    adaptive(s, t0, mid, left, accuracy / 2, depth + 1) +
    adaptive(s, mid, t1, right, accuracy / 2, depth + 1)
  );
};

/**
 * Length of the segment between parameters t0 and t1 (default: the whole segment),
 * accurate to roughly `accuracy` model units. Exact for lines.
 *
 * The range is first split at the x and y extrema. A cusp (where the curve stops and turns
 * back) is always at such an extremum, and the speed |B'(t)| has a sharp corner there that
 * the quadrature cannot follow; splitting keeps every piece smooth.
 */
export const segmentLength = (s: Segment, accuracy: number, t0 = 0, t1 = 1): number => {
  if (!(accuracy > 0)) throw new RangeError('accuracy must be greater than 0');
  if (s.kind === 'line') return distance(s.p0, s.p1) * Math.abs(t1 - t0);
  if (t0 === t1) return 0;
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const cuts = [lo, ...extrema(s).filter((t) => t > lo && t < hi), hi];
  const share = accuracy / (cuts.length - 1);
  let total = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i] ?? lo;
    const b = cuts[i + 1] ?? hi;
    total += adaptive(s, a, b, quadrature(s, a, b), share, 0);
  }
  return total;
};

/**
 * The parameter t at which the length from the start reaches `target`, to within
 * roughly `accuracy` model units. Clamped to [0, 1] when target is outside the segment.
 */
export const tAtLength = (s: Segment, target: number, accuracy: number): number => {
  const total = segmentLength(s, accuracy);
  if (target <= 0) return 0;
  if (target >= total) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const l = segmentLength(s, accuracy / 4, 0, mid);
    if (Math.abs(l - target) <= accuracy) return mid;
    if (l < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
