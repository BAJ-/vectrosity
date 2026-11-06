import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { apply, IDENTITY, mapPoints, scaling, signedArea } from '@vcore/geometry';
import { invertibleAffineArb } from '@vcore/geometry/testing';
import { isClosed } from './model';
import { toSegments } from './segments';
import { contourArb } from './testing/arbitraries';
import { sameSegments } from './testing/outline';
import { isMirroring, transformContour, transformPath } from './transform';

describe('transformContour', () => {
  it('transforms the outline and keeps every ID and type', () => {
    fc.assert(
      fc.property(contourArb, invertibleAffineArb, (c, m) => {
        const moved = transformContour(c, m);
        expect(moved.points.map((p) => [p.id, p.type])).toEqual(
          c.points.map((p) => [p.id, p.type]),
        );
        const expected = toSegments(c).map((s) => mapPoints(s, (p) => apply(m, p)));
        expect(sameSegments(toSegments(moved), expected)).toBe(true);
      }),
    );
  });

  it('flips the sign of the area when it mirrors', () => {
    fc.assert(
      fc.property(contourArb.filter(isClosed), (c) => {
        const mirrored = transformContour(c, scaling(-1, 1));
        expect(isMirroring(scaling(-1, 1))).toBe(true);
        const a = signedArea(toSegments(c));
        expect(signedArea(toSegments(mirrored))).toBeCloseTo(-a, 6);
      }),
    );
  });

  it('leaves the path unchanged under the identity', () => {
    fc.assert(
      fc.property(contourArb, (c) => {
        expect(transformPath({ contours: [c] }, IDENTITY)).toEqual({ contours: [c] });
      }),
    );
  });
});
