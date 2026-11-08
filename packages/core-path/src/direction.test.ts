import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { line, vec2 } from '@vcore/geometry';
import { contourArea, correctDirections } from './direction';
import { reverseContour } from './edit';
import { counterIds } from './ids';
import type { Contour } from './model';
import { contourFromSegments } from './segments';

/** A counter-clockwise (y-up) square. */
const square = (x: number, y: number, size: number, prefix: string): Contour =>
  contourFromSegments(
    [
      line(vec2(x, y), vec2(x + size, y)),
      line(vec2(x + size, y), vec2(x + size, y + size)),
      line(vec2(x + size, y + size), vec2(x, y + size)),
      line(vec2(x, y + size), vec2(x, y)),
    ],
    true,
    counterIds(prefix),
  );

// Three nested squares (outer, hole, island) and one separate square, in mixed directions.
const outer = square(0, 0, 100, 'a');
const hole = reverseContour(square(10, 10, 80, 'b'));
const island = reverseContour(square(30, 30, 40, 'c'));
const separate = square(200, 0, 50, 'd');
const nested = { contours: [outer, hole, island, separate] };
const signs = (contours: readonly Contour[]) => contours.map((c) => Math.sign(contourArea(c)));

describe('correctDirections', () => {
  it('alternates direction with nesting depth', () => {
    const ccw = correctDirections(nested, 'counterclockwise', 0.1);
    expect(signs(ccw.contours)).toEqual([1, -1, 1, 1]);
    const cw = correctDirections(nested, 'clockwise', 0.1);
    expect(signs(cw.contours)).toEqual([-1, 1, -1, -1]);
  });

  it('gives the same result whatever directions the contours start with', () => {
    const flips = fc.array(fc.boolean(), { minLength: 4, maxLength: 4 });
    fc.assert(
      fc.property(flips, (flip) => {
        const input = nested.contours.map((c, i) => (flip[i] ? reverseContour(c) : c));
        const result = correctDirections({ contours: input }, 'counterclockwise', 0.1);
        expect(signs(result.contours)).toEqual([1, -1, 1, 1]);
      }),
    );
  });

  it('keeps every ID and leaves open contours alone', () => {
    const open = contourFromSegments([line(vec2(0, 0), vec2(5, 5))], false, counterIds('o'));
    const result = correctDirections({ contours: [...nested.contours, open] }, 'clockwise', 0.1);
    expect(result.contours.map((c) => c.id)).toEqual([...nested.contours, open].map((c) => c.id));
    expect(result.contours.at(-1)).toBe(open);
  });
});
