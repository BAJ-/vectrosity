import { cross, dot, length, sub } from '@vcore/geometry';
import { isClosed, isOnCurve, type Path } from './model';

/**
 * Marks on-curve points smooth where the outline has no corner: the directions from the
 * previous point and to the next point differ by at most `maxAngle` radians.
 * Useful after importing data that has no smooth flags, such as SVG path data.
 * Points with a zero-length neighbour, and the ends of open contours, are left as they are.
 */
export const detectSmoothPoints = (path: Path, maxAngle: number): Path => ({
  contours: path.contours.map((c) => {
    const n = c.points.length;
    const closed = isClosed(c);
    return {
      ...c,
      points: c.points.map((p, i) => {
        if (!isOnCurve(p) || (!closed && (i === 0 || i === n - 1))) return p;
        const prev = c.points.at((i - 1 + n) % n);
        const next = c.points.at((i + 1) % n);
        if (!prev || !next) return p;
        const a = sub(p, prev);
        const b = sub(next, p);
        if (length(a) === 0 || length(b) === 0) return p;
        const angle = Math.abs(Math.atan2(cross(a, b), dot(a, b)));
        return angle <= maxAngle ? { ...p, smooth: true } : p;
      }),
    };
  }),
});
