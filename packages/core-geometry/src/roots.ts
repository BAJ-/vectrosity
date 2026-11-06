/**
 * Real roots of a*t^2 + b*t + c = 0, sorted ascending.
 * Uses the numerically stable form (no cancellation between -b and sqrt(disc)),
 * and falls back to the linear case when `a` is negligible next to `b` and `c`.
 */
export const solveQuadratic = (a: number, b: number, c: number): number[] => {
  const magnitude = Math.max(Math.abs(b), Math.abs(c));
  if (Math.abs(a) <= 1e-12 * magnitude || a === 0) {
    if (b === 0) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  if (disc === 0) return [-b / (2 * a)];
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(disc));
  const r1 = q / a;
  const r2 = c / q;
  return r1 < r2 ? [r1, r2] : [r2, r1];
};

/** Keeps only values strictly inside (0, 1); endpoints are handled separately by callers. */
export const insideUnitInterval = (ts: readonly number[]): number[] =>
  ts.filter((t) => t > 0 && t < 1);
