import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { extrema, segmentBounds, segmentsBounds } from './bounds';
import { cubic, evaluate, line, quad } from './segment';
import { vec2 } from './vec';
import { segmentArb } from './testing/arbitraries';

describe('segmentBounds', () => {
  it('contains every point on the segment', () => {
    fc.assert(
      fc.property(segmentArb, (s) => {
        const r = segmentBounds(s);
        const eps =
          1e-9 *
          Math.max(1, Math.abs(r.minX), Math.abs(r.maxX), Math.abs(r.minY), Math.abs(r.maxY));
        for (let i = 0; i <= 64; i++) {
          const p = evaluate(s, i / 64);
          expect(p.x).toBeGreaterThanOrEqual(r.minX - eps);
          expect(p.x).toBeLessThanOrEqual(r.maxX + eps);
          expect(p.y).toBeGreaterThanOrEqual(r.minY - eps);
          expect(p.y).toBeLessThanOrEqual(r.maxY + eps);
        }
      }),
    );
  });

  it('is tight: dense sampling reaches every edge', () => {
    fc.assert(
      fc.property(segmentArb, (s) => {
        const r = segmentBounds(s);
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (let i = 0; i <= 4000; i++) {
          const p = evaluate(s, i / 4000);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
        const eps = 1e-3 * Math.max(1, maxX - minX, maxY - minY);
        expect(Math.abs(r.minX - minX)).toBeLessThan(eps);
        expect(Math.abs(r.maxX - maxX)).toBeLessThan(eps);
        expect(Math.abs(r.minY - minY)).toBeLessThan(eps);
        expect(Math.abs(r.maxY - maxY)).toBeLessThan(eps);
      }),
    );
  });

  it('is tighter than the control points for a bulging cubic', () => {
    const c = cubic(vec2(0, 0), vec2(0, 100), vec2(100, 100), vec2(100, 0));
    expect(segmentBounds(c)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 75 });
  });

  it('handles degenerate segments', () => {
    const p = vec2(5, 5);
    expect(segmentBounds(cubic(p, p, p, p))).toEqual({ minX: 5, minY: 5, maxX: 5, maxY: 5 });
    // Zero-length handles: a straight cubic.
    const straight = cubic(vec2(0, 0), vec2(0, 0), vec2(10, 10), vec2(10, 10));
    expect(segmentBounds(straight)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    expect(extrema(line(vec2(0, 0), vec2(1, 1)))).toEqual([]);
    expect(extrema(quad(vec2(0, 0), vec2(1, 1), vec2(2, 2)))).toEqual([]);
  });

  it('unions several segments', () => {
    const r = segmentsBounds([line(vec2(0, 0), vec2(10, 0)), line(vec2(10, 0), vec2(10, -5))]);
    expect(r).toEqual({ minX: 0, minY: -5, maxX: 10, maxY: 0 });
  });
});
