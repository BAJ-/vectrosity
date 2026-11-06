import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { flatten, flattenPieceCount, flattenSegment } from './flatten';
import { cubic, endPoint, evaluate, line, quad } from './segment';
import { vec2 } from './vec';
import { segmentArb, unitT } from './testing/arbitraries';
import { distanceToPiece } from './testing/geometry';

const tolerance = fc.double({ min: 0.01, max: 10, noNaN: true });

describe('flattenSegment', () => {
  it('keeps every point of the curve within tolerance of its piece', () => {
    fc.assert(
      fc.property(segmentArb, tolerance, unitT, (s, tol, t) => {
        const pts = flattenSegment(s, tol);
        const pieces = pts.length - 1;
        // Pieces are evenly spaced in t, so t falls in piece floor(t * pieces).
        const i = Math.min(pieces - 1, Math.floor(t * pieces));
        const a = pts.at(i);
        const b = pts.at(i + 1);
        if (!a || !b) throw new Error('missing points');
        expect(distanceToPiece(evaluate(s, t), a, b)).toBeLessThanOrEqual(tol * (1 + 1e-9) + 1e-9);
      }),
    );
  });

  it('starts and ends on the segment end points', () => {
    fc.assert(
      fc.property(segmentArb, tolerance, (s, tol) => {
        const pts = flattenSegment(s, tol);
        expect(pts.at(0)).toEqual(s.p0);
        expect(pts.at(-1)).toEqual(evaluate(s, 1));
      }),
    );
  });

  it('uses one piece for lines and straight curves', () => {
    expect(flattenPieceCount(line(vec2(0, 0), vec2(100, 0)), 0.1)).toBe(1);
    expect(flattenPieceCount(cubic(vec2(0, 0), vec2(1, 0), vec2(2, 0), vec2(3, 0)), 0.1)).toBe(1);
  });

  it('uses more pieces for a tighter tolerance', () => {
    const c = cubic(vec2(0, 0), vec2(0, 100), vec2(100, 100), vec2(100, 0));
    expect(flattenPieceCount(c, 0.01)).toBeGreaterThan(flattenPieceCount(c, 1));
  });

  it('rejects a tolerance that is not positive', () => {
    const q = quad(vec2(0, 0), vec2(1, 1), vec2(2, 0));
    expect(() => flattenPieceCount(q, 0)).toThrow(RangeError);
  });
});

describe('flatten', () => {
  it('joins segments without repeating shared points', () => {
    const a = line(vec2(0, 0), vec2(10, 0));
    const b = line(vec2(10, 0), vec2(10, 10));
    expect(flatten([a, b], 1)).toEqual([vec2(0, 0), vec2(10, 0), vec2(10, 10)]);
    expect(flatten([a, b], 1).at(-1)).toEqual(endPoint(b));
  });
});
