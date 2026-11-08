import { describe, expect, it } from 'vitest';
import { cross, distance, sub, vec2 } from '@vcore/geometry';
import { counterIds, fromSvgPath, type Path, type Point } from '@vcore/path';
import { constrainDelta, movePoints } from './drag';

// Two cubics meeting at the anchor (20,20), with its handles at (10,20) before and (30,20) after.
// Points are found by position (`at`) and then by id (`byId`), so tests do not depend on ids.
const build = (smooth: boolean): Path => {
  const path = fromSvgPath('M0 0 C0 10 10 20 20 20 C30 20 40 10 40 0', counterIds());
  return {
    contours: path.contours.map((c) => ({
      ...c,
      points: c.points.map((p) =>
        p.x === 20 && p.y === 20 && smooth ? { ...p, smooth: true } : p,
      ),
    })),
  };
};
const at = (path: Path, x: number, y: number): Point => {
  const p = path.contours.flatMap((c) => c.points).find((q) => q.x === x && q.y === y);
  if (!p) throw new Error(`no point at ${x},${y}`);
  return p;
};
const byId = (path: Path, id: string): Point => {
  const p = path.contours.flatMap((c) => c.points).find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};

describe('movePoints', () => {
  it('moves an anchor together with its own handles', () => {
    const path = build(false);
    const anchor = at(path, 20, 20);
    const moved = movePoints(path, new Set([anchor.id]), vec2(5, -5));
    expect(byId(moved, anchor.id)).toMatchObject({ x: 25, y: 15 });
    expect(byId(moved, at(path, 10, 20).id)).toMatchObject({ x: 15, y: 15 });
    expect(byId(moved, at(path, 30, 20).id)).toMatchObject({ x: 35, y: 15 });
    // Handles belonging to other anchors stay put.
    expect(byId(moved, at(path, 0, 10).id)).toMatchObject({ x: 0, y: 10 });
  });

  it('moves a selected handle only once when its anchor is selected too', () => {
    const path = build(false);
    const selection = new Set([at(path, 20, 20).id, at(path, 30, 20).id]);
    const moved = movePoints(path, selection, vec2(1, 0));
    expect(byId(moved, at(path, 30, 20).id)).toMatchObject({ x: 31, y: 20 });
  });

  it('turns the opposite handle of a smooth anchor and keeps its length', () => {
    const path = build(true);
    const anchor = at(path, 20, 20);
    const dragged = at(path, 30, 20);
    const opposite = at(path, 10, 20);
    const moved = movePoints(path, new Set([dragged.id]), vec2(0, 10));
    const h = byId(moved, dragged.id);
    const o = byId(moved, opposite.id);
    // Still in a straight line through the anchor, on the other side, same length (10).
    expect(Math.abs(cross(sub(h, anchor), sub(o, anchor)))).toBeLessThan(1e-9);
    expect(distance(o, anchor)).toBeCloseTo(10, 9);
    expect(o.x).toBeLessThan(anchor.x);
  });

  it('leaves the opposite handle alone when the anchor is a corner', () => {
    const path = build(false);
    const moved = movePoints(path, new Set([at(path, 30, 20).id]), vec2(0, 10));
    expect(byId(moved, at(path, 10, 20).id)).toMatchObject({ x: 10, y: 20 });
  });

  it('does not drag a quadratic control point along with either anchor', () => {
    const path = fromSvgPath('M0 0 Q10 10 20 0', counterIds());
    const start = at(path, 0, 0);
    const moved = movePoints(path, new Set([start.id]), vec2(5, 0));
    expect(byId(moved, at(path, 10, 10).id)).toMatchObject({ x: 10, y: 10 });
  });
});

describe('constrainDelta', () => {
  it('snaps to the nearest of horizontal, vertical and 45 degrees', () => {
    const h = constrainDelta(vec2(10, 2));
    expect(h.x).toBeCloseTo(10, 9);
    expect(h.y).toBeCloseTo(0, 9);
    const v = constrainDelta(vec2(-1, 8));
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(8, 9);
    const d = constrainDelta(vec2(10, 9));
    expect(d.x).toBeCloseTo(d.y, 9);
  });
});
