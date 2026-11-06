import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  apply,
  compose,
  determinant,
  IDENTITY,
  invert,
  rotation,
  scaling,
  translate,
} from './affine';
import { nearlyEqual, vec2 } from './vec';
import { affineArb, invertibleAffineArb, point } from './testing/arbitraries';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  nearlyEqual(a, b, 1e-6 * Math.max(1, Math.abs(b.x), Math.abs(b.y)));

describe('affine', () => {
  it('applies the basic transforms', () => {
    expect(apply(translate(10, 20), vec2(1, 2))).toEqual(vec2(11, 22));
    expect(apply(scaling(2, 3), vec2(1, 2))).toEqual(vec2(2, 6));
    expect(close(apply(rotation(Math.PI / 2), vec2(1, 0)), vec2(0, 1))).toBe(true);
  });

  it('compose(first, second) applies first, then second', () => {
    fc.assert(
      fc.property(affineArb, affineArb, point, (m, n, p) => {
        expect(close(apply(compose(m, n), p), apply(n, apply(m, p)))).toBe(true);
      }),
    );
  });

  it('identity changes nothing', () => {
    fc.assert(
      fc.property(point, (p) => {
        expect(apply(IDENTITY, p)).toEqual(p);
      }),
    );
  });

  it('invert undoes the transform', () => {
    fc.assert(
      fc.property(invertibleAffineArb, point, (m, p) => {
        expect(Math.abs(determinant(m))).toBeGreaterThan(0);
        const inv = invert(m);
        expect(inv).not.toBeNull();
        if (inv) expect(close(apply(inv, apply(m, p)), p)).toBe(true);
      }),
    );
  });

  it('returns null for a singular transform', () => {
    expect(invert([1, 2, 2, 4, 0, 0])).toBeNull();
    expect(invert(scaling(0))).toBeNull();
  });
});
