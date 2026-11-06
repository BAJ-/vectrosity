import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nearestPoint } from './nearest';
import { controlPoints, cubic, evaluate, line, quad } from './segment';
import { distance, vec2 } from './vec';
import { point, segmentArb, unitT } from './testing/arbitraries';
import { magnitude } from './testing/geometry';

describe('nearestPoint', () => {
  it('is never further than the best of a dense sample', () => {
    fc.assert(
      fc.property(segmentArb, point, (s, p) => {
        let sampled = Infinity;
        for (let i = 0; i <= 2000; i++)
          sampled = Math.min(sampled, distance(evaluate(s, i / 2000), p));
        const found = nearestPoint(s, p);
        expect(found.distance).toBeLessThanOrEqual(
          sampled + 1e-7 * magnitude(p, ...controlPoints(s)),
        );
        expect(found.t).toBeGreaterThanOrEqual(0);
        expect(found.t).toBeLessThanOrEqual(1);
        expect(found.point).toEqual(evaluate(s, found.t));
      }),
    );
  });

  it('finds a point that is on the curve', () => {
    fc.assert(
      fc.property(segmentArb, unitT, (s, t) => {
        const on = evaluate(s, t);
        expect(nearestPoint(s, on).distance).toBeLessThan(1e-6 * magnitude(...controlPoints(s)));
      }),
    );
  });

  it('projects onto a line and clamps to its ends', () => {
    const l = line(vec2(0, 0), vec2(10, 0));
    expect(nearestPoint(l, vec2(4, 3))).toEqual({ t: 0.4, point: vec2(4, 0), distance: 3 });
    expect(nearestPoint(l, vec2(-5, 0)).t).toBe(0);
    expect(nearestPoint(l, vec2(15, 0)).t).toBe(1);
  });

  it('finds the right point on a curve that folds back on itself', () => {
    // Found by a random test run: the curve passes x = 44.87 twice, once going out and once
    // coming back, with the turning point (a distance maximum) between them.
    const folded = quad(vec2(44.79798595416715, 0), vec2(47.23217485431444, 0), vec2(0, 0));
    const on = evaluate(folded, 0.01596877273153632);
    expect(nearestPoint(folded, on).distance).toBeLessThan(1e-9);
  });

  it('handles a zero-length line', () => {
    const p = vec2(2, 2);
    expect(nearestPoint(line(p, p), vec2(5, 6)).distance).toBe(5);
  });

  it('finds the top of an arch', () => {
    const arch = cubic(vec2(0, 0), vec2(0, 100), vec2(100, 100), vec2(100, 0));
    const found = nearestPoint(arch, vec2(50, 200));
    expect(found.t).toBeCloseTo(0.5, 9);
    expect(found.point.y).toBeCloseTo(75, 9);
  });
});
