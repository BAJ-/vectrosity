import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { insideUnitInterval, solveQuadratic } from './roots';

describe('solveQuadratic', () => {
  it('solves the textbook cases', () => {
    expect(solveQuadratic(1, -3, 2)).toEqual([1, 2]);
    expect(solveQuadratic(1, 2, 1)).toEqual([-1]);
    expect(solveQuadratic(1, 0, 1)).toEqual([]);
    expect(solveQuadratic(0, 2, -4)).toEqual([2]);
    expect(solveQuadratic(0, 0, 1)).toEqual([]);
  });

  it('stays accurate when b is much larger than a and c', () => {
    // Roots are about -1e-8 and -1e8; the naive formula loses the small one completely.
    const [small = NaN, big = NaN] = solveQuadratic(1, 1e8, 1).sort((a, b) => b - a);
    expect(small).toBeCloseTo(-1e-8, 20);
    expect(big).toBeCloseTo(-1e8, 0);
  });

  it('finds the roots of any (t - r1)(t - r2)', () => {
    const r = fc.double({ min: -100, max: 100, noNaN: true });
    fc.assert(
      fc.property(r, r, (r1, r2) => {
        const roots = solveQuadratic(1, -(r1 + r2), r1 * r2);
        expect(roots.length).toBeGreaterThanOrEqual(1);
        for (const t of roots)
          expect(Math.abs(t * t - (r1 + r2) * t + r1 * r2)).toBeLessThan(
            1e-6 * (1 + Math.abs(r1 * r2) + Math.abs(r1 + r2)),
          );
      }),
    );
  });

  it('filters to the open unit interval', () => {
    expect(insideUnitInterval([-1, 0, 0.5, 1, 2])).toEqual([0.5]);
  });
});
