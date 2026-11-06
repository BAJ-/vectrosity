import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { segmentSignedArea, signedArea } from './area';
import { cubic, derivative, evaluate, line, quad, reverse, toCubic, type Segment } from './segment';
import { vec2 } from './vec';
import { segmentArb } from './testing/arbitraries';

/** 1/2 * integral of (x*y' - y*x') dt by composite Simpson's rule: an independent check of the closed forms. */
const numericArea = (s: Segment): number => {
  const n = 2000;
  const f = (t: number) => {
    const p = evaluate(s, t);
    const d = derivative(s, t);
    return (p.x * d.y - p.y * d.x) / 2;
  };
  let sum = f(0) + f(1);
  for (let i = 1; i < n; i++) sum += f(i / n) * (i % 2 === 0 ? 2 : 4);
  return sum / (3 * n);
};

const square = [
  line(vec2(0, 0), vec2(10, 0)),
  line(vec2(10, 0), vec2(10, 10)),
  line(vec2(10, 10), vec2(0, 10)),
  line(vec2(0, 10), vec2(0, 0)),
];

describe('signedArea', () => {
  it('matches numeric integration for every segment kind', () => {
    fc.assert(
      fc.property(segmentArb, (s) => {
        const exact = segmentSignedArea(s);
        expect(Math.abs(exact - numericArea(s))).toBeLessThan(1e-6 * Math.max(1, Math.abs(exact)));
      }),
    );
  });

  it('is positive for a counter-clockwise (y-up) square', () => {
    expect(signedArea(square)).toBe(100);
  });

  it('flips sign when the contour is reversed', () => {
    expect(signedArea(square.map(reverse).reverse())).toBe(-100);
    fc.assert(
      fc.property(segmentArb, (s) => {
        expect(segmentSignedArea(reverse(s))).toBeCloseTo(-segmentSignedArea(s), 6);
      }),
    );
  });

  it('is unchanged by converting to cubics', () => {
    fc.assert(
      fc.property(segmentArb, (s) => {
        const a = segmentSignedArea(s);
        expect(Math.abs(segmentSignedArea(toCubic(s)) - a)).toBeLessThan(
          1e-9 * Math.max(1, Math.abs(a)),
        );
      }),
    );
  });

  it('approximates a circle drawn with four cubics', () => {
    const k = 0.5522847498 * 100;
    const circle = [
      cubic(vec2(100, 0), vec2(100, k), vec2(k, 100), vec2(0, 100)),
      cubic(vec2(0, 100), vec2(-k, 100), vec2(-100, k), vec2(-100, 0)),
      cubic(vec2(-100, 0), vec2(-100, -k), vec2(-k, -100), vec2(0, -100)),
      cubic(vec2(0, -100), vec2(k, -100), vec2(100, -k), vec2(100, 0)),
    ];
    // The standard four-cubic circle is within about 0.03% of the true area pi * r^2.
    expect(Math.abs(signedArea(circle) / (Math.PI * 100 * 100) - 1)).toBeLessThan(3e-4);
  });

  it('gives a closed quadratic loop the expected area', () => {
    // A quadratic arch from (2,0) over control (1,2) to (0,0), closed along the x axis: area = 4/3.
    const loop = [quad(vec2(2, 0), vec2(1, 2), vec2(0, 0)), line(vec2(0, 0), vec2(2, 0))];
    expect(signedArea(loop)).toBeCloseTo(4 / 3, 12);
  });
});
