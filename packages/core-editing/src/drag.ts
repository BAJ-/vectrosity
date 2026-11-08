import { add, length, scale, sub, vec2, type Vec2 } from '@vcore/geometry';
import { isClosed, isOnCurve, type Contour, type Path, type Point } from '@vcore/path';

/** The IDs of the selected points. */
export type Selection = ReadonlySet<string>;

/**
 * Limits a drag to horizontal, vertical or 45 degrees, whichever is closest
 * (what holding shift does in most drawing apps).
 */
export const constrainDelta = (d: Vec2): Vec2 => {
  const angle = Math.atan2(d.y, d.x);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const along = d.x * Math.cos(snapped) + d.y * Math.sin(snapped);
  return vec2(along * Math.cos(snapped), along * Math.sin(snapped));
};

const neighbour = (c: Contour, i: number, step: 1 | -1): number | null => {
  const j = i + step;
  if (j >= 0 && j < c.points.length) return j;
  return isClosed(c) ? (j + c.points.length) % c.points.length : null;
};

const pointAt = (c: Contour, i: number | null): Point | undefined =>
  i === null ? undefined : c.points.at(i);

const onCurveAt = (c: Contour, i: number | null): boolean => {
  const p = pointAt(c, i);
  return p !== undefined && isOnCurve(p);
};

/**
 * The anchor an off-curve point belongs to: its one on-curve neighbour. A handle between two
 * on-curve points (a quadratic's only control point) or between two off-curve points (inside
 * a TrueType spline) belongs to no anchor and does not follow anchor moves.
 */
const ownerIndex = (c: Contour, i: number): number | null => {
  const prev = neighbour(c, i, -1);
  const next = neighbour(c, i, 1);
  const prevOn = onCurveAt(c, prev);
  if (prevOn === onCurveAt(c, next)) return null;
  return prevOn ? prev : next;
};

/**
 * Moves the selected points by `delta` (model units). Structure-preserving.
 * - An anchor's own handles move with it.
 * - A handle dragged on its own, on a smooth anchor, turns the anchor's opposite handle so the
 *   two stay in a straight line; the opposite handle keeps its length.
 */
export const movePoints = (path: Path, selection: Selection, delta: Vec2): Path => ({
  contours: path.contours.map((c) => {
    const moving = new Set<number>();
    c.points.forEach((p, i) => {
      if (!selection.has(p.id)) return;
      moving.add(i);
      if (!isOnCurve(p)) return;
      for (const step of [-1, 1] as const) {
        const n = neighbour(c, i, step);
        const q = pointAt(c, n);
        if (n !== null && q && !isOnCurve(q) && ownerIndex(c, n) === i) moving.add(n);
      }
    });
    if (moving.size === 0) return c;
    const points = c.points.map((p, i) => (moving.has(i) ? { ...p, ...add(p, delta) } : p));
    // Keep smooth anchors smooth when only one of their handles moved.
    moving.forEach((i) => {
      const handle = points.at(i);
      const ownerI = ownerIndex(c, i);
      if (!handle || isOnCurve(handle) || ownerI === null || moving.has(ownerI)) return;
      const anchor = points.at(ownerI);
      if (!anchor?.smooth) return;
      const oppositeI = neighbour(c, ownerI, ownerI === neighbour(c, i, 1) ? 1 : -1);
      const opposite = pointAt(c, oppositeI);
      if (oppositeI === null || !opposite || isOnCurve(opposite) || moving.has(oppositeI)) return;
      if (ownerIndex(c, oppositeI) !== ownerI) return;
      const out = sub(handle, anchor);
      const outLength = length(out);
      if (outLength === 0) return;
      const keep = length(sub(opposite, anchor));
      const turned = sub(anchor, scale(out, keep / outLength));
      points[oppositeI] = { ...opposite, x: turned.x, y: turned.y };
    });
    return { ...c, points };
  }),
});
