import { sub, dot, distance, lerp, type Vec2 } from '../vec';

/** Distance from p to the straight piece between a and b. */
export const distanceToPiece = (p: Vec2, a: Vec2, b: Vec2): number => {
  const d = sub(b, a);
  const lengthSquared = dot(d, d);
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), d) / lengthSquared));
  return distance(p, lerp(a, b, t));
};

/** The largest absolute coordinate among the points, at least 1: a scale for relative tolerances. */
export const magnitude = (...points: Vec2[]): number =>
  Math.max(1, ...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
