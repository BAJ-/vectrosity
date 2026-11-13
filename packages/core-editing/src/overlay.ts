import { apply, type Affine, type Vec2 } from '@vcore/geometry';
import { isClosed, isOnCurve, type Contour, type Path } from '@vcore/path';
import type { Selection } from './drag';
import type { PenState } from './pen';

/**
 * One thing to draw on top of the outline while editing, in screen coordinates. The core
 * decides what is drawn and where; each app decides how it looks.
 */
export type OverlayItem =
  /** A line from an anchor to one of its handles (or between the handles of a TrueType spline). */
  | { readonly kind: 'handle'; readonly from: Vec2; readonly to: Vec2 }
  /** A point: an anchor drawn as a corner or smooth, or an off-curve handle. */
  | {
      readonly kind: 'point';
      readonly id: string;
      readonly at: Vec2;
      readonly shape: 'corner' | 'smooth' | 'offcurve';
      /** The first point of its contour, which marks where the contour starts. */
      readonly start: boolean;
      readonly selected: boolean;
      readonly hovered: boolean;
    }
  /** The pen's dragged-out handle, which the next segment will start with. */
  | { readonly kind: 'pending'; readonly from: Vec2; readonly to: Vec2 }
  /** The selection rectangle being dragged. */
  | { readonly kind: 'marquee'; readonly from: Vec2; readonly to: Vec2 };

export interface OverlayInput {
  readonly path: Path;
  /** Model coordinates to screen coordinates. */
  readonly view: Affine;
  readonly selection: Selection;
  readonly hovered: string | null;
  readonly pen?: PenState;
  /** Corners of the selection rectangle, already in screen coordinates. */
  readonly marquee?: { readonly start: Vec2; readonly end: Vec2 } | null;
}

/**
 * Pairs of point indices joined by a handle line: each off-curve point to its neighbours,
 * except the two handles of one cubic, which are not joined to each other. Open contours do
 * not wrap from their last point to their first.
 */
const handlePairs = (c: Contour): [number, number][] => {
  const pts = c.points;
  const closed = isClosed(c);
  const pairs: [number, number][] = [];
  pts.forEach((p, i) => {
    const j = i + 1 < pts.length ? i + 1 : closed ? 0 : -1;
    const q = pts[j];
    if (!q || (isOnCurve(p) && isOnCurve(q))) return;
    if (!isOnCurve(p) && !isOnCurve(q)) {
      const nextOn = [...pts.slice(j), ...pts.slice(0, j)].find(isOnCurve);
      if (nextOn?.type === 'curve') return;
    }
    pairs.push([i, j]);
  });
  return pairs;
};

/** Everything to draw over the outline, in drawing order: handles, points, pen, rectangle. */
export const overlay = (input: OverlayInput): OverlayItem[] => {
  const { path, view, selection, hovered, pen, marquee } = input;
  const screen = (p: Vec2): Vec2 => apply(view, p);
  const handles = path.contours.flatMap((c) =>
    handlePairs(c).flatMap(([i, j]): OverlayItem[] => {
      const a = c.points[i];
      const b = c.points[j];
      return a && b ? [{ kind: 'handle', from: screen(a), to: screen(b) }] : [];
    }),
  );
  const points = path.contours.flatMap((c) =>
    c.points.map((p, i): OverlayItem => ({
      kind: 'point',
      id: p.id,
      at: screen(p),
      shape: !isOnCurve(p) ? 'offcurve' : p.smooth ? 'smooth' : 'corner',
      start: i === 0,
      selected: selection.has(p.id),
      hovered: p.id === hovered,
    })),
  );
  const last = path.contours.find((c) => c.id === pen?.contourId)?.points.at(-1);
  const pending: OverlayItem[] =
    pen?.pendingOut && last
      ? [{ kind: 'pending', from: screen(last), to: screen(pen.pendingOut) }]
      : [];
  const box: OverlayItem[] = marquee
    ? [{ kind: 'marquee', from: marquee.start, to: marquee.end }]
    : [];
  return [...handles, ...points, ...pending, ...box];
};
