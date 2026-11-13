import { add, dot, length, scale, sub, vec2, type Vec2 } from '@vcore/geometry';
import { contourRuns, isClosed, isOnCurve, type Contour, type Path, type Point } from '@vcore/path';

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
 * What happens to the opposite handle when a handle of a smooth anchor is dragged on its own:
 * - 'keep-length': it turns to stay in line and keeps its own length (the usual for fonts);
 * - 'mirror': it turns to stay in line and takes the same length;
 * - 'independent': it stays put, and the anchor becomes a corner.
 * A tool setting, not stored on the anchor.
 */
export type HandleMode = 'keep-length' | 'mirror' | 'independent';

export interface MoveOptions {
  /** Defaults to 'keep-length'. */
  readonly handles?: HandleMode;
}

/**
 * Moves the selected points by `delta` (model units). Structure-preserving.
 * - An anchor's own handles move with it.
 * - A handle dragged on its own, on a smooth anchor, turns the anchor's opposite handle so the
 *   two stay in a straight line, as `handles` says (see HandleMode). When a straight line
 *   arrives on the other side instead (a tangent anchor), the handle only slides along the
 *   line's direction, unless `handles` is 'independent'.
 */
export const movePoints = (
  path: Path,
  selection: Selection,
  delta: Vec2,
  options: MoveOptions = {},
): Path => {
  if (delta.x === 0 && delta.y === 0) return path;
  return {
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
      // A smooth anchor whose handle moved on its own: keep it smooth, or make it a corner.
      moving.forEach((i) => {
        const handle = points.at(i);
        const ownerI = ownerIndex(c, i);
        if (!handle || isOnCurve(handle) || ownerI === null || moving.has(ownerI)) return;
        const anchor = points.at(ownerI);
        if (!anchor?.smooth) return;
        const mode = options.handles ?? 'keep-length';
        if (mode === 'independent') {
          points[ownerI] = { ...anchor, smooth: false };
          return;
        }
        const oppositeI = neighbour(c, ownerI, ownerI === neighbour(c, i, 1) ? 1 : -1);
        const opposite = pointAt(c, oppositeI);
        if (oppositeI === null || !opposite || moving.has(oppositeI)) return;
        if (isOnCurve(opposite)) {
          // A tangent anchor: a straight line arrives on the other side, so the handle may only
          // slide along the line's direction, and not past the anchor.
          const line = sub(anchor, opposite);
          const lineLength = length(line);
          if (lineLength === 0) return;
          const along = scale(line, 1 / lineLength);
          const reach = Math.max(0, dot(sub(handle, anchor), along));
          const slid = add(anchor, scale(along, reach));
          points[i] = { ...handle, x: slid.x, y: slid.y };
          return;
        }
        if (ownerIndex(c, oppositeI) !== ownerI) return;
        const out = sub(handle, anchor);
        const outLength = length(out);
        if (outLength === 0) return;
        const keep = mode === 'mirror' ? outLength : length(sub(opposite, anchor));
        const turned = sub(anchor, scale(out, keep / outLength));
        points[oppositeI] = { ...opposite, x: turned.x, y: turned.y };
      });
      return { ...c, points };
    }),
  };
};

/**
 * How much of a segment drag goes to the end handle (the rest goes to the start handle),
 * for a grab at t. Near the start only the start handle moves, near the end only the end
 * handle, and in between it changes smoothly. This is the weighting Inkscape uses.
 */
const endWeight = (t: number): number => {
  if (t <= 1 / 6) return 0;
  if (t <= 0.5) return ((6 * t - 1) / 2) ** 3 / 2;
  if (t <= 5 / 6) return (1 - ((6 * (1 - t) - 1) / 2) ** 3) / 2 + 0.5;
  return 1;
};

/**
 * Reshapes a cubic segment so its point at t moves by `delta` (model units), by moving its
 * two handles; the anchors stay put. Smooth anchors stay smooth, as when dragging a handle.
 * Anything other than a cubic run, or t not strictly between 0 and 1, changes nothing.
 * Structure-preserving.
 *
 * Why the handle moves are what they are: the point at t is
 *   B(t) = (1-t)^3 P0 + 3t(1-t)^2 P1 + 3t^2(1-t) P2 + t^3 P3,
 * so moving P1 by d1 and P2 by d2 moves B(t) by 3t(1-t)^2 d1 + 3t^2(1-t) d2. Choosing
 *   d1 = (1-w) delta / (3t(1-t)^2) and d2 = w delta / (3t^2(1-t))
 * makes that (1-w) delta + w delta = delta for any weight w.
 */
export const dragSegment = (
  path: Path,
  contourId: string,
  run: number,
  t: number,
  delta: Vec2,
): Path => {
  if (!(t > 0 && t < 1)) return path;
  const c = path.contours.find((k) => k.id === contourId);
  const r = c && contourRuns(c).at(run);
  if (!c || !r || r.type !== 'curve' || r.offs.length !== 2) return path;
  const first = c.points[r.offs[0] ?? -1];
  const second = c.points[r.offs[1] ?? -1];
  if (!first || !second) return path;
  const w = endWeight(t);
  const d1 = scale(delta, (1 - w) / (3 * t * (1 - t) ** 2));
  const d2 = scale(delta, w / (3 * t ** 2 * (1 - t)));
  return movePoints(movePoints(path, new Set([first.id]), d1), new Set([second.id]), d2);
};
