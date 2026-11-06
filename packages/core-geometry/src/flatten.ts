import { controlPoints, evaluate, type Segment } from './segment';
import { length, sub, type Vec2 } from './vec';

/** Upper limit on pieces per segment, so a tiny tolerance cannot make flattening run forever. */
const MAX_PIECES = 10_000;

/**
 * How many evenly spaced (in t) straight pieces keep every piece within `tolerance`
 * (model units) of the curve. This is Wang's formula:
 *   pieces = ceil(sqrt(maxSecondDifference * n * (n - 1) / (8 * tolerance)))
 * where n is the degree and maxSecondDifference is the longest |p[i] - 2 p[i+1] + p[i+2]|.
 * Capped at MAX_PIECES; a curve that would need more is flattened more coarsely than asked.
 */
export const flattenPieceCount = (s: Segment, tolerance: number): number => {
  if (!(tolerance > 0)) throw new RangeError('tolerance must be greater than 0');
  if (s.kind === 'line') return 1;
  const pts = controlPoints(s);
  const n = pts.length - 1;
  let maxSecondDifference = 0;
  for (let i = 0; i + 2 < pts.length; i++) {
    const [a, b, c] = [pts.at(i), pts.at(i + 1), pts.at(i + 2)];
    if (!a || !b || !c) continue;
    const d = length(sub(sub(a, b), sub(b, c)));
    maxSecondDifference = Math.max(maxSecondDifference, d);
  }
  const pieces = Math.ceil(Math.sqrt((maxSecondDifference * n * (n - 1)) / (8 * tolerance)));
  return Math.min(MAX_PIECES, Math.max(1, pieces));
};

/**
 * Points along the segment, start and end included, such that the straight lines between
 * consecutive points stay within `tolerance` of the curve.
 */
export const flattenSegment = (s: Segment, tolerance: number): Vec2[] => {
  const pieces = flattenPieceCount(s, tolerance);
  const points: Vec2[] = [];
  for (let i = 0; i <= pieces; i++) points.push(evaluate(s, i / pieces));
  return points;
};

/**
 * A polyline for consecutive segments (each one starting where the previous one ends).
 * Shared points between segments appear once.
 */
export const flatten = (segments: readonly Segment[], tolerance: number): Vec2[] => {
  const points: Vec2[] = [];
  segments.forEach((s, index) => {
    const part = flattenSegment(s, tolerance);
    points.push(...(index === 0 ? part : part.slice(1)));
  });
  return points;
};
