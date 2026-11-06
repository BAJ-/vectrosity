import { controlPoints, endPoint, nearlyEqual, type Segment } from '@vcore/geometry';
import { magnitude } from '@vcore/geometry/testing';

/** True when two segment lists have the same kinds and control points, within a relative tolerance. */
export const sameSegments = (a: readonly Segment[], b: readonly Segment[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((s, i) => {
    const t = b.at(i);
    if (!t || s.kind !== t.kind) return false;
    const ps = controlPoints(s);
    const pt = controlPoints(t);
    const tol = 1e-9 * magnitude(...ps, ...pt);
    return ps.every((p, k) => {
      const q = pt.at(k);
      return q !== undefined && nearlyEqual(p, q, tol);
    });
  });
};

/** Every segment starts where the previous one ends (and, for a loop, the last ends at the first). */
export const isChain = (segments: readonly Segment[], loop: boolean): boolean =>
  segments.every((s, i) => {
    const previous = i === 0 ? (loop ? segments.at(-1) : undefined) : segments.at(i - 1);
    if (!previous) return true;
    const e = endPoint(previous);
    return nearlyEqual(e, s.p0, 1e-9 * magnitude(e, s.p0));
  });
