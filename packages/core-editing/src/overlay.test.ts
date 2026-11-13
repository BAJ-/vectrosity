import { describe, expect, it } from 'vitest';
import { scaling, vec2 } from '@vcore/geometry';
import { counterIds, fromSvgPath, type Path } from '@vcore/path';
import { overlay, type OverlayItem } from './overlay';

const of = <K extends OverlayItem['kind']>(items: OverlayItem[], kind: K) =>
  items.filter((i): i is Extract<OverlayItem, { kind: K }> => i.kind === kind);

describe('overlay', () => {
  // An open contour: a line, then a cubic with handles (10,10) and (20,10).
  const path: Path = fromSvgPath('M0 0 L10 0 C10 10 20 10 20 0', counterIds());
  const ids = path.contours[0]?.points.map((p) => p.id) ?? [];
  const view = scaling(2);
  const base = { path, view, selection: new Set<string>(), hovered: null };

  it('joins each handle to its own anchor, in screen coordinates', () => {
    const lines = of(overlay(base), 'handle').map((h) => [h.from, h.to]);
    expect(lines).toEqual([
      [vec2(20, 0), vec2(20, 20)],
      [vec2(40, 20), vec2(40, 0)],
    ]);
  });

  it('lists every point with its shape and state', () => {
    const smooth: Path = {
      contours: path.contours.map((c) => ({
        ...c,
        points: c.points.map((p, i) => (i === 1 ? { ...p, smooth: true } : p)),
      })),
    };
    const points = of(
      overlay({ ...base, path: smooth, selection: new Set([ids[1] ?? '']), hovered: ids[4] ?? '' }),
      'point',
    );
    expect(points.map((p) => p.shape)).toEqual([
      'corner',
      'smooth',
      'offcurve',
      'offcurve',
      'corner',
    ]);
    expect(points.map((p) => p.start)).toEqual([true, false, false, false, false]);
    expect(points.map((p) => p.selected)).toEqual([false, true, false, false, false]);
    expect(points.map((p) => p.hovered)).toEqual([false, false, false, false, true]);
    expect(points[4]?.at).toEqual(vec2(40, 0));
  });

  it('joins the off-curve points of a TrueType spline to each other', () => {
    // One qcurve run with two control points: the on-curve point between them is implied.
    const spline: Path = {
      contours: [
        {
          id: 'c',
          points: [
            { id: 'a', x: 0, y: 0, type: 'move' },
            { id: 'b', x: 10, y: 10, type: 'offcurve' },
            { id: 'd', x: 30, y: -10, type: 'offcurve' },
            { id: 'e', x: 40, y: 0, type: 'qcurve' },
          ],
        },
      ],
    };
    const lines = of(overlay({ ...base, path: spline, view: scaling(1) }), 'handle');
    expect(lines.map((h) => [h.from, h.to])).toEqual([
      [vec2(0, 0), vec2(10, 10)],
      [vec2(10, 10), vec2(30, -10)],
      [vec2(30, -10), vec2(40, 0)],
    ]);
  });

  it('adds the pen handle and the selection rectangle', () => {
    const items = overlay({
      ...base,
      pen: { contourId: path.contours[0]?.id ?? null, pendingOut: vec2(30, 5) },
      marquee: { start: vec2(1, 2), end: vec2(3, 4) },
    });
    expect(of(items, 'pending')).toEqual([
      { kind: 'pending', from: vec2(40, 0), to: vec2(60, 10) },
    ]);
    expect(of(items, 'marquee')).toEqual([{ kind: 'marquee', from: vec2(1, 2), to: vec2(3, 4) }]);
  });
});
