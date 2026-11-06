import fc from 'fast-check';
import { vec2, type Vec2 } from '../vec';
import { cubic, line, quad, type Segment } from '../segment';
import type { Affine } from '../affine';

/** Coordinates in a range typical of font units and drawing canvases. */
// `+ 0` turns -0 into 0: they are the same coordinate, but toEqual tells them apart.
export const coord = fc
  .double({ min: -2000, max: 2000, noNaN: true, noDefaultInfinity: true })
  .map((v) => v + 0);
export const point: fc.Arbitrary<Vec2> = fc.tuple(coord, coord).map(([x, y]) => vec2(x, y));
export const unitT = fc.double({ min: 0, max: 1, noNaN: true });

export const lineArb = fc.tuple(point, point).map(([a, b]) => line(a, b));
export const quadArb = fc.tuple(point, point, point).map(([a, b, c]) => quad(a, b, c));
export const cubicArb = fc
  .tuple(point, point, point, point)
  .map(([a, b, c, d]) => cubic(a, b, c, d));
export const segmentArb: fc.Arbitrary<Segment> = fc.oneof(lineArb, quadArb, cubicArb);

const factor = fc.double({ min: -4, max: 4, noNaN: true });
export const affineArb: fc.Arbitrary<Affine> = fc
  .tuple(factor, factor, factor, factor, coord, coord)
  .map(([a, b, c, d, e, f]) => [a, b, c, d, e, f] as const);

/** Absolute tolerance scaled to the size of the numbers involved. */
export const tol = (...values: number[]): number => 1e-9 * Math.max(1, ...values.map(Math.abs));

/** Transforms guaranteed to be invertible: rotate, scale by a non-zero factor, shear, then translate. */
const nonZeroScale = fc
  .tuple(fc.double({ min: 0.1, max: 4, noNaN: true }), fc.boolean())
  .map(([v, negative]) => (negative ? -v : v));
export const invertibleAffineArb: fc.Arbitrary<Affine> = fc
  .tuple(
    fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    nonZeroScale,
    nonZeroScale,
    fc.double({ min: -1, max: 1, noNaN: true }),
    coord,
    coord,
  )
  .map(([angle, sx, sy, shear, tx, ty]) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // rotation * shear * scale, then translation
    return [c * sx, s * sx, (c * shear - s) * sy, (s * shear + c) * sy, tx, ty] as const;
  });
