import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { add, cross, distance, dot, lerp, nearlyEqual, sub, vec2 } from './vec';
import { point, tol, unitT } from './testing/arbitraries';

describe('vec', () => {
  it('does basic arithmetic', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
    expect(sub(vec2(1, 2), vec2(3, 4))).toEqual(vec2(-2, -2));
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(cross(vec2(1, 0), vec2(0, 1))).toBe(1);
    expect(distance(vec2(0, 0), vec2(3, 4))).toBe(5);
  });

  it('lerp hits both ends exactly', () => {
    fc.assert(
      fc.property(point, point, (a, b) => {
        expect(lerp(a, b, 0)).toEqual(a);
        expect(nearlyEqual(lerp(a, b, 1), b, tol(a.x, a.y, b.x, b.y))).toBe(true);
      }),
    );
  });

  it('lerp stays on the segment', () => {
    fc.assert(
      fc.property(point, point, unitT, (a, b, t) => {
        const p = lerp(a, b, t);
        const d = distance(a, p) + distance(p, b) - distance(a, b);
        expect(Math.abs(d)).toBeLessThanOrEqual(tol(a.x, a.y, b.x, b.y) * 10);
      }),
    );
  });
});
