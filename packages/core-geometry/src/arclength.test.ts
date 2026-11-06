import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { segmentLength, tAtLength } from './arclength';
import { flattenSegment } from './flatten';
import { cubic, line, quad, split } from './segment';
import { distance, vec2 } from './vec';
import { segmentArb, unitT } from './testing/arbitraries';

/** Length of a very fine polyline: an independent check that is always slightly short. */
const polylineLength = (pts: { x: number; y: number }[]): number =>
  pts.reduce((sum, p, i) => (i === 0 ? 0 : sum + distance(pts[i - 1] ?? p, p)), 0);

describe('segmentLength', () => {
  it('is exact for lines', () => {
    expect(segmentLength(line(vec2(0, 0), vec2(3, 4)), 1e-9)).toBe(5);
    expect(segmentLength(line(vec2(0, 0), vec2(3, 4)), 1e-9, 0, 0.5)).toBe(2.5);
  });

  it('matches a fine polyline', () => {
    fc.assert(
      fc.property(segmentArb, (s) => {
        const exact = segmentLength(s, 1e-6);
        const approx = polylineLength(flattenSegment(s, 1e-4));
        // A polyline is never longer than the curve; allow for the requested accuracy.
        expect(approx).toBeLessThanOrEqual(exact + 1e-6 * Math.max(1, exact));
        expect(exact - approx).toBeLessThan(1e-3 * Math.max(1, exact));
      }),
    );
  });

  it('adds up across a split', () => {
    fc.assert(
      fc.property(segmentArb, unitT, (s, t) => {
        const [left, right] = split(s, t);
        const whole = segmentLength(s, 1e-7);
        const parts = segmentLength(left, 1e-7) + segmentLength(right, 1e-7);
        expect(Math.abs(whole - parts)).toBeLessThan(1e-5 * Math.max(1, whole));
      }),
    );
  });

  it('measures a curve that stops and turns back (a cusp)', () => {
    // Found by a random test run: all points on the x axis, going out to the right and back.
    const p1 = 1.8314337160184786;
    const p2 = -0.02353256796304326;
    const folded = quad(vec2(0, 0), vec2(p1, 0), vec2(p2, 0));
    // x(t) = 2 p1 t (1 - t) + p2 t^2 turns back where x'(t) = 0, at t = p1 / (2 p1 - p2).
    const t = p1 / (2 * p1 - p2);
    const xMax = 2 * p1 * t * (1 - t) + p2 * t * t;
    // Length = out to xMax, then back to p2.
    expect(segmentLength(folded, 1e-9)).toBeCloseTo(xMax + (xMax - p2), 9);
  });

  it('measures a quarter of the standard four-cubic circle', () => {
    const k = 0.5522847498 * 100;
    const quarter = cubic(vec2(100, 0), vec2(100, k), vec2(k, 100), vec2(0, 100));
    // A true quarter circle of radius 100 is pi * 100 / 2 = 157.0796...; the cubic is within 0.03%.
    expect(Math.abs(segmentLength(quarter, 1e-9) / ((Math.PI * 100) / 2) - 1)).toBeLessThan(3e-4);
  });
});

describe('tAtLength', () => {
  it('finds the t where the length from the start reaches the target', () => {
    fc.assert(
      fc.property(segmentArb, unitT, (s, fraction) => {
        const total = segmentLength(s, 1e-6);
        fc.pre(total > 1);
        const target = total * fraction;
        const t = tAtLength(s, target, 1e-4);
        expect(Math.abs(segmentLength(s, 1e-6, 0, t) - target)).toBeLessThan(1e-3);
      }),
    );
  });

  it('clamps outside the segment', () => {
    const l = line(vec2(0, 0), vec2(10, 0));
    expect(tAtLength(l, -5, 1e-6)).toBe(0);
    expect(tAtLength(l, 50, 1e-6)).toBe(1);
  });
});
