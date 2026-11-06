import { vec2, type Vec2 } from './vec';

/**
 * A 2D affine transform [a, b, c, d, e, f], the same order as SVG and canvas:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */
export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export const translate = (tx: number, ty: number): Affine => [1, 0, 0, 1, tx, ty];
export const scaling = (sx: number, sy: number = sx): Affine => [sx, 0, 0, sy, 0, 0];
/** Rotation by `radians`; counter-clockwise in a y-up frame. */
export const rotation = (radians: number): Affine => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, s, -s, c, 0, 0];
};

export const apply = (m: Affine, p: Vec2): Vec2 =>
  vec2(m[0] * p.x + m[2] * p.y + m[4], m[1] * p.x + m[3] * p.y + m[5]);

/** The transform that applies `first`, then `second`. */
export const compose = (first: Affine, second: Affine): Affine => {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a2 * a1 + c2 * b1,
    b2 * a1 + d2 * b1,
    a2 * c1 + c2 * d1,
    b2 * c1 + d2 * d1,
    a2 * e1 + c2 * f1 + e2,
    b2 * e1 + d2 * f1 + f2,
  ];
};

export const determinant = (m: Affine): number => m[0] * m[3] - m[1] * m[2];

/** The inverse transform, or `null` when `m` is singular (it squashes the plane onto a line or point). */
export const invert = (m: Affine): Affine | null => {
  const det = determinant(m);
  if (det === 0 || !Number.isFinite(det)) return null;
  const [a, b, c, d, e, f] = m;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};
