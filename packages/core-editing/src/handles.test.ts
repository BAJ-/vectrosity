import { describe, expect, it } from 'vitest';
import { cross, distance, sub } from '@vcore/geometry';
import {
  counterIds,
  fromSvgPath,
  toSegments,
  validatePath,
  type Path,
  type Point,
} from '@vcore/path';
import { resetHandles, retractHandle, toggleSmooth } from './handles';
import { diff, emptyHistory, record, undo } from './history';

const load = (d: string): Path => fromSvgPath(d, counterIds('s'));
const points = (path: Path): Point[] => path.contours.flatMap((c) => c.points);
const at = (path: Path, x: number, y: number): Point => {
  const p = points(path).find((q) => q.x === x && q.y === y);
  if (!p) throw new Error(`no point at ${x},${y}`);
  return p;
};
const neighbours = (path: Path, id: string): [Point, Point] => {
  const pts = points(path);
  const i = pts.findIndex((p) => p.id === id);
  const before = pts[i - 1];
  const after = pts[i + 1];
  if (!before || !after) throw new Error('no neighbours');
  return [before, after];
};

describe('resetHandles', () => {
  // A line arrives at (30,0), a curve leaves it: the anchor has one handle.
  const d = 'M0 0 L30 0 C40 0 60 10 60 30';

  it('adds the missing handle by turning the line into a curve', () => {
    const path = load(d);
    const anchor = at(path, 30, 0);
    const reset = resetHandles(path, anchor.id, counterIds('n'));
    expect(validatePath(reset)).toEqual([]);
    expect(points(reset)).toHaveLength(points(path).length + 2);
    const [before, after] = neighbours(reset, anchor.id);
    expect(before.type).toBe('offcurve');
    expect(after.type).toBe('offcurve');
    // In line through the anchor, on opposite sides, parallel to (0,0) -> (60,30).
    expect(Math.abs(cross(sub(before, anchor), sub(after, anchor)))).toBeLessThan(1e-9);
    expect(Math.abs(cross(sub(after, anchor), { x: 60, y: 30 }))).toBeLessThan(1e-9);
    expect(after.x).toBeGreaterThan(anchor.x);
    // Each 1/3 of the distance to the anchor on its side.
    expect(distance(before, anchor)).toBeCloseTo(10, 9);
    expect(distance(after, anchor)).toBeCloseTo(Math.hypot(30, 30) / 3, 9);
    expect(points(reset).find((p) => p.id === anchor.id)?.smooth).toBe(true);
  });

  it('gives a corner between two lines a handle on each side', () => {
    const path = load('M0 0 L10 0 L10 10 Z');
    const reset = resetHandles(path, at(path, 10, 0).id, counterIds('n'));
    expect(validatePath(reset)).toEqual([]);
    expect(toSegments(reset.contours[0] ?? { id: '', points: [] }).map((s) => s.kind)).toEqual([
      'cubic',
      'cubic',
      'line',
    ]);
  });

  it('works on the first point of a closed contour', () => {
    const path = load('M0 0 L10 0 L10 10 Z');
    const reset = resetHandles(path, at(path, 0, 0).id, counterIds('n'));
    expect(validatePath(reset)).toEqual([]);
    expect(points(reset)).toHaveLength(7);
  });

  it('gives the end of an open contour one handle, pointing at its neighbour', () => {
    const path = load('M0 0 L30 0');
    const start = at(path, 0, 0);
    const reset = resetHandles(path, start.id, counterIds('n'));
    expect(validatePath(reset)).toEqual([]);
    expect(points(reset)[1]).toMatchObject({ type: 'offcurve', x: 10, y: 0 });
    expect(points(reset).find((p) => p.id === start.id)?.smooth).toBeUndefined();
  });

  it('is undone in one step', () => {
    const path = load(d);
    const reset = resetHandles(path, at(path, 30, 0).id, counterIds('n'));
    const history = record(emptyHistory, diff({ path, guides: [] }, { path: reset, guides: [] }));
    expect(undo(history, { path: reset, guides: [] })?.state.path).toEqual(path);
  });
});

describe('retractHandle', () => {
  const d = 'M0 0 C0 10 10 20 20 20';

  it('moves the handle onto its anchor and keeps the curve', () => {
    const path = load(d);
    const retracted = retractHandle(path, at(path, 0, 10).id);
    expect(points(retracted)).toHaveLength(4);
    expect(points(retracted)[1]).toMatchObject({ type: 'offcurve', x: 0, y: 0 });
  });

  it('makes the segment a line when its other handle is retracted too', () => {
    const path = load(d);
    const once = retractHandle(path, at(path, 0, 10).id);
    const twice = retractHandle(once, at(path, 10, 20).id);
    expect(validatePath(twice)).toEqual([]);
    expect(points(twice).map((p) => p.type)).toEqual(['move', 'line']);
  });

  it('ignores anchors and quadratic control points', () => {
    const path = load('M0 0 Q10 10 20 0');
    expect(retractHandle(path, at(path, 10, 10).id)).toBe(path);
    expect(retractHandle(path, at(path, 0, 0).id)).toBe(path);
  });
});

describe('toggleSmooth', () => {
  const smoothAt = (path: Path, id: string) => points(path).find((p) => p.id === id)?.smooth;

  it('lines up two handles and keeps their lengths, then turns back into a corner', () => {
    // Corner at (20,20): handle (10,20) before it, (30,30) after it.
    const path = load('M0 0 C0 10 10 20 20 20 C30 30 40 10 40 0');
    const anchor = at(path, 20, 20);
    const smooth = toggleSmooth(path, anchor.id);
    const [before, after] = neighbours(smooth, anchor.id);
    expect(Math.abs(cross(sub(before, anchor), sub(after, anchor)))).toBeLessThan(1e-9);
    expect(distance(before, anchor)).toBeCloseTo(10, 9);
    expect(distance(after, anchor)).toBeCloseTo(Math.hypot(10, 10), 9);
    expect(after.x).toBeGreaterThan(anchor.x);
    expect(smoothAt(smooth, anchor.id)).toBe(true);
    const corner = toggleSmooth(smooth, anchor.id);
    expect(smoothAt(corner, anchor.id)).toBe(false);
    expect(neighbours(corner, anchor.id)).toEqual([before, after]);
  });

  it('turns a handle next to a straight line to continue the line', () => {
    const path = load('M0 0 L30 0 C40 10 60 10 60 30');
    const anchor = at(path, 30, 0);
    const smooth = toggleSmooth(path, anchor.id);
    const [, handle] = neighbours(smooth, anchor.id);
    expect(handle.x).toBeCloseTo(30 + Math.hypot(10, 10), 9);
    expect(handle.y).toBeCloseTo(0, 9);
    expect(smoothAt(smooth, anchor.id)).toBe(true);
  });

  it('leaves an anchor between two straight lines alone', () => {
    const path = load('M0 0 L10 0 L10 10 Z');
    expect(toggleSmooth(path, at(path, 10, 0).id)).toBe(path);
  });
});
