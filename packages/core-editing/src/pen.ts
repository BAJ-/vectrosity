import { sub, type Vec2 } from '@vcore/geometry';
import {
  isClosed,
  reverseContour,
  type Contour,
  type IdGenerator,
  type Path,
  type Point,
} from '@vcore/path';

/** What the pen tool is doing between presses. */
export interface PenState {
  /** The open contour being drawn, or null when no contour is being drawn. */
  readonly contourId: string | null;
  /** Where the next segment's first handle goes, after dragging out the last anchor. */
  readonly pendingOut: Vec2 | null;
}

export const idlePen: PenState = { contourId: null, pendingOut: null };

const same = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

const offPoint = (id: string, p: Vec2): Point => ({ id, x: p.x, y: p.y, type: 'offcurve' });

/** The handle opposite to `drag` through `anchor`: dragging out an anchor mirrors its handles. */
const mirror = (anchor: Vec2, drag: Vec2): Vec2 => sub(anchor, sub(drag, anchor));

/**
 * The points that draw the segment from `from` to the anchor at `to`: none for a line, or the
 * two handles of a cubic. A handle that was not dragged out sits on its anchor.
 */
const segmentHandles = (
  from: Vec2,
  pendingOut: Vec2 | null,
  to: Vec2,
  incoming: Vec2 | null,
  ids: IdGenerator,
): Point[] =>
  pendingOut || incoming
    ? [offPoint(ids(), pendingOut ?? from), offPoint(ids(), incoming ?? to)]
    : [];

const activeContour = (path: Path, pen: PenState): Contour | undefined =>
  path.contours.find((c) => c.id === pen.contourId && !isClosed(c));

/**
 * One press of the pen tool at `at` (model units), with the mouse now at `dragTo`.
 * Starts a new open contour, or adds an anchor to the end of the one being drawn.
 * A click (dragTo equal to at) adds a corner; a drag adds a smooth anchor whose outgoing
 * handle follows the mouse and whose incoming handle mirrors it.
 * Call it again with the same `path` and `pen` as the mouse moves. Structure-changing.
 */
export const penAdd = (
  path: Path,
  pen: PenState,
  at: Vec2,
  dragTo: Vec2,
  ids: IdGenerator,
): { path: Path; pen: PenState } => {
  const dragged = !same(at, dragTo);
  const pendingOut = dragged ? dragTo : null;
  const active = activeContour(path, pen);
  const last = active?.points.at(-1);
  if (!active || !last) {
    const contour: Contour = { id: ids(), points: [{ id: ids(), x: at.x, y: at.y, type: 'move' }] };
    return {
      path: { contours: [...path.contours, contour] },
      pen: { contourId: contour.id, pendingOut },
    };
  }
  const handles = segmentHandles(
    last,
    pen.pendingOut,
    at,
    dragged ? mirror(at, dragTo) : null,
    ids,
  );
  const anchor: Point = {
    id: ids(),
    x: at.x,
    y: at.y,
    type: handles.length > 0 ? 'curve' : 'line',
    ...(dragged ? { smooth: true } : {}),
  };
  const contour = { ...active, points: [...active.points, ...handles, anchor] };
  return {
    path: { contours: path.contours.map((c) => (c.id === contour.id ? contour : c)) },
    pen: { contourId: contour.id, pendingOut },
  };
};

/**
 * Closes the contour being drawn with a press on its first point, the mouse now at `dragTo`.
 * Dragging gives the first point an incoming handle that mirrors the mouse, and turns its
 * outgoing handle (if it has one) to follow the mouse, making it smooth.
 * Needs at least two points; otherwise nothing changes. Structure-changing.
 */
export const penClose = (
  path: Path,
  pen: PenState,
  dragTo: Vec2,
  ids: IdGenerator,
): { path: Path; pen: PenState } => {
  const active = activeContour(path, pen);
  const first = active?.points[0];
  const last = active?.points.at(-1);
  if (!active || !first || !last || active.points.length < 2) return { path, pen };
  const dragged = !same(first, dragTo);
  const handles = segmentHandles(
    last,
    pen.pendingOut,
    first,
    dragged ? mirror(first, dragTo) : null,
    ids,
  );
  const second = active.points[1];
  const hasOutHandle = second?.type === 'offcurve';
  const points = active.points.map((p, i): Point => {
    if (i === 0) {
      const closed: Point = { ...p, type: handles.length > 0 ? 'curve' : 'line' };
      return dragged && hasOutHandle ? { ...closed, smooth: true } : closed;
    }
    return i === 1 && dragged && hasOutHandle ? { ...p, x: dragTo.x, y: dragTo.y } : p;
  });
  const contour = { ...active, points: [...points, ...handles] };
  return {
    path: { contours: path.contours.map((c) => (c.id === contour.id ? contour : c)) },
    pen: idlePen,
  };
};

/**
 * Picks up drawing at an end of an open contour. When `pointId` is its first point the
 * contour is reversed first, so new anchors are always added after the last point.
 * Returns null when the point is not an end of an open contour.
 */
export const penContinue = (path: Path, pointId: string): { path: Path; pen: PenState } | null => {
  const contour = path.contours.find((c) => c.points.some((p) => p.id === pointId));
  if (!contour || isClosed(contour) || contour.points.length < 2) return null;
  const isFirst = contour.points[0]?.id === pointId;
  const isLast = contour.points.at(-1)?.id === pointId;
  if (!isFirst && !isLast) return null;
  const continued = isFirst ? reverseContour(contour) : contour;
  return {
    path: { contours: path.contours.map((c) => (c.id === contour.id ? continued : c)) },
    pen: { contourId: contour.id, pendingOut: null },
  };
};
