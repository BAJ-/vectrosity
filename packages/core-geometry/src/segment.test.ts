import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  cubic,
  derivative,
  endPoint,
  evaluate,
  line,
  quad,
  reverse,
  split,
  toCubic,
} from './segment';
import { nearlyEqual, sub, vec2, type Vec2 } from './vec';
import { segmentArb, unitT } from './testing/arbitraries';
import type { Segment } from './segment';

const size = (s: Segment): number => {
  const pts: Vec2[] =
    s.kind === 'line'
      ? [s.p0, s.p1]
      : s.kind === 'quad'
        ? [s.p0, s.p1, s.p2]
        : [s.p0, s.p1, s.p2, s.p3];
  return Math.max(1, ...pts.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
};
const close = (a: Vec2, b: Vec2, s: Segment) => nearlyEqual(a, b, 1e-9 * size(s));

describe('evaluate', () => {
  it('starts and ends on the end points', () => {
    fc.assert(
      fc.property(segmentArb, (s) => {
        expect(evaluate(s, 0)).toEqual(s.p0);
        expect(close(evaluate(s, 1), endPoint(s), s)).toBe(true);
      }),
    );
  });

  it('matches the Bernstein form for a cubic', () => {
    const c = cubic(vec2(0, 0), vec2(0, 100), vec2(100, 100), vec2(100, 0));
    expect(evaluate(c, 0.5)).toEqual(vec2(50, 75));
  });
});

describe('derivative', () => {
  it('matches a finite difference', () => {
    fc.assert(
      fc.property(segmentArb, fc.double({ min: 0.01, max: 0.99, noNaN: true }), (s, t) => {
        const h = 1e-6;
        const fd = sub(evaluate(s, t + h), evaluate(s, t - h));
        const approx = vec2(fd.x / (2 * h), fd.y / (2 * h));
        expect(nearlyEqual(derivative(s, t), approx, 1e-3 * size(s))).toBe(true);
      }),
    );
  });
});

describe('split', () => {
  it('both halves trace the original', () => {
    fc.assert(
      fc.property(segmentArb, unitT, unitT, (s, t, u) => {
        const [left, right] = split(s, t);
        expect(left.kind).toBe(s.kind);
        expect(close(evaluate(left, u), evaluate(s, u * t), s)).toBe(true);
        expect(close(evaluate(right, u), evaluate(s, t + u * (1 - t)), s)).toBe(true);
      }),
    );
  });

  it('keeps the original end points', () => {
    fc.assert(
      fc.property(segmentArb, unitT, (s, t) => {
        const [left, right] = split(s, t);
        expect(left.p0).toEqual(s.p0);
        expect(endPoint(right)).toEqual(endPoint(s));
        expect(endPoint(left)).toEqual(right.p0);
      }),
    );
  });
});

describe('reverse', () => {
  it('traces the same points backwards', () => {
    fc.assert(
      fc.property(segmentArb, unitT, (s, t) => {
        expect(close(evaluate(reverse(s), t), evaluate(s, 1 - t), s)).toBe(true);
      }),
    );
  });

  it('twice is the identity', () => {
    fc.assert(
      fc.property(segmentArb, (s) => {
        expect(reverse(reverse(s))).toEqual(s);
      }),
    );
  });
});

describe('toCubic', () => {
  it('keeps the exact shape', () => {
    fc.assert(
      fc.property(segmentArb, unitT, (s, t) => {
        expect(close(evaluate(toCubic(s), t), evaluate(s, t), s)).toBe(true);
      }),
    );
  });

  it('handles the simple cases', () => {
    expect(toCubic(line(vec2(0, 0), vec2(3, 0))).p1).toEqual(vec2(1, 0));
    const q = quad(vec2(0, 0), vec2(3, 3), vec2(6, 0));
    expect(toCubic(q).p1).toEqual(vec2(2, 2));
    expect(toCubic(q).p2).toEqual(vec2(4, 2));
  });
});
