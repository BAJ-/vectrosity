import { describe, expect, it } from 'vitest';
import { vec2, type Vec2 } from '@vcore/geometry';
import { counterIds, emptyPath, isClosed, validatePath, type Path } from '@vcore/path';
import { diff, diffPaths, emptyHistory, record, redo, undo } from './history';
import { idlePen, penAdd, penClose, penContinue, type PenState } from './pen';

/** Presses the pen at each point in turn; a second point means a drag to it. */
const draw = (presses: [Vec2, Vec2?][]): { path: Path; pen: PenState } => {
  const ids = counterIds();
  let state = { path: emptyPath(), pen: idlePen };
  for (const [at, dragTo] of presses) state = penAdd(state.path, state.pen, at, dragTo ?? at, ids);
  return state;
};
const types = (path: Path) => path.contours.flatMap((c) => c.points.map((p) => p.type));
const coords = (path: Path) => path.contours.flatMap((c) => c.points.map((p) => [p.x, p.y]));

describe('penAdd', () => {
  it('starts an open contour and adds corners with clicks', () => {
    const { path, pen } = draw([[vec2(0, 0)], [vec2(10, 0)], [vec2(10, 10)]]);
    expect(validatePath(path)).toEqual([]);
    expect(types(path)).toEqual(['move', 'line', 'line']);
    expect(pen).toEqual({ contourId: path.contours[0]?.id, pendingOut: null });
  });

  it('adds a smooth anchor with mirrored handles when dragged', () => {
    const { path, pen } = draw([[vec2(0, 0)], [vec2(10, 0), vec2(15, 5)]]);
    expect(validatePath(path)).toEqual([]);
    expect(types(path)).toEqual(['move', 'offcurve', 'offcurve', 'curve']);
    // First handle sits on the first anchor (not dragged); second mirrors the drag.
    expect(coords(path)).toEqual([
      [0, 0],
      [0, 0],
      [5, -5],
      [10, 0],
    ]);
    expect(path.contours[0]?.points[3]?.smooth).toBe(true);
    expect(pen.pendingOut).toEqual(vec2(15, 5));
  });

  it('uses a dragged-out handle for the next segment', () => {
    const { path } = draw([[vec2(0, 0), vec2(0, 5)], [vec2(10, 0)]]);
    expect(types(path)).toEqual(['move', 'offcurve', 'offcurve', 'curve']);
    expect(coords(path)[1]).toEqual([0, 5]);
    expect(coords(path)[2]).toEqual([10, 0]);
  });

  it('starts a new contour after the previous one was closed', () => {
    const ids = counterIds('x');
    const open = draw([[vec2(0, 0)], [vec2(10, 0)], [vec2(10, 10)]]);
    const closed = penClose(open.path, open.pen, vec2(0, 0), ids);
    const next = penAdd(closed.path, closed.pen, vec2(50, 50), vec2(50, 50), ids);
    expect(next.path.contours).toHaveLength(2);
  });
});

describe('penClose', () => {
  it('closes with a line on a click', () => {
    const ids = counterIds('x');
    const { path, pen } = draw([[vec2(0, 0)], [vec2(10, 0)], [vec2(10, 10)]]);
    const closed = penClose(path, pen, vec2(0, 0), ids);
    expect(validatePath(closed.path)).toEqual([]);
    expect(isClosed(closed.path.contours[0] ?? { id: '', points: [] })).toBe(true);
    expect(types(closed.path)).toEqual(['line', 'line', 'line']);
    expect(closed.pen).toEqual(idlePen);
  });

  it('closes with a curve when the last anchor was dragged out', () => {
    const ids = counterIds('x');
    const { path, pen } = draw([[vec2(0, 0)], [vec2(10, 0)], [vec2(10, 10), vec2(5, 15)]]);
    const closed = penClose(path, pen, vec2(0, 0), ids);
    expect(validatePath(closed.path)).toEqual([]);
    expect(types(closed.path)).toEqual([
      'curve',
      'line',
      'offcurve',
      'offcurve',
      'curve',
      'offcurve',
      'offcurve',
    ]);
  });

  it('dragging on the first point makes it smooth when it has an outgoing handle', () => {
    const ids = counterIds('x');
    const { path, pen } = draw([[vec2(0, 0), vec2(0, 5)], [vec2(10, 0)], [vec2(10, 10)]]);
    const closed = penClose(path, pen, vec2(0, 8), ids);
    expect(validatePath(closed.path)).toEqual([]);
    const points = closed.path.contours[0]?.points ?? [];
    expect(points[0]?.smooth).toBe(true);
    expect(points[1]).toMatchObject({ x: 0, y: 8 });
    expect(points.at(-1)).toMatchObject({ type: 'offcurve', x: 0, y: -8 });
  });

  it('does nothing with fewer than two points', () => {
    const { path, pen } = draw([[vec2(0, 0)]]);
    expect(penClose(path, pen, vec2(0, 0), counterIds('x')).path).toBe(path);
  });
});

describe('penContinue', () => {
  const { path } = draw([[vec2(0, 0)], [vec2(10, 0)], [vec2(10, 10)]]);
  const id = (i: number) => path.contours[0]?.points[i]?.id ?? '';

  it('continues from the last point as it is', () => {
    const result = penContinue(path, id(2));
    expect(result?.path).toEqual(path);
    expect(result?.pen.contourId).toBe(path.contours[0]?.id);
  });

  it('reverses the contour when continuing from the first point', () => {
    const result = penContinue(path, id(0));
    expect(coords(result?.path ?? path)).toEqual([
      [10, 10],
      [10, 0],
      [0, 0],
    ]);
  });

  it('refuses points in the middle and closed contours', () => {
    expect(penContinue(path, id(1))).toBeNull();
    const closed = penClose(
      path,
      { contourId: path.contours[0]?.id ?? null, pendingOut: null },
      vec2(0, 0),
      counterIds('x'),
    );
    expect(penContinue(closed.path, id(2))).toBeNull();
  });
});

describe('history with added contours', () => {
  it('undoes and redoes a new contour', () => {
    const before = { path: emptyPath(), guides: [] };
    const after = { path: draw([[vec2(0, 0)]]).path, guides: [] };
    const history = record(emptyHistory, diff(before, after));
    const undone = undo(history, after);
    expect(undone?.state).toEqual(before);
    expect(redo(undone?.history ?? history, undone?.state ?? before)?.state).toEqual(after);
  });

  it('refuses removed contours', () => {
    const path = draw([[vec2(0, 0)]]).path;
    expect(() => diffPaths(path, emptyPath())).toThrow();
  });
});
