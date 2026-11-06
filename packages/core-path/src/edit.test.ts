import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cubic, line, reverse, signedArea, split, vec2 } from '@vcore/geometry';
import {
  closeContour,
  deletePoint,
  insertPoint,
  makeImpliedPointsExplicit,
  openContour,
  reverseContour,
  setStartPoint,
} from './edit';
import { counterIds } from './ids';
import { isClosed, isOnCurve, validateContour, type Contour } from './model';
import { contourRuns } from './runs';
import { contourFromSegments, contourSegments, toSegments } from './segments';
import { contourArb, qcurveContourArb } from './testing/arbitraries';
import { isChain, sameSegments } from './testing/outline';

const anyContour = fc.oneof(contourArb, qcurveContourArb);
const ids = (c: Contour) => c.points.map((p) => p.id);
const onCurveIds = (c: Contour) => c.points.filter(isOnCurve).map((p) => p.id);
const closedContour = anyContour.filter(isClosed);
const t = fc.double({ min: 0.001, max: 0.999, noNaN: true });

const square = (): Contour =>
  contourFromSegments(
    [
      line(vec2(0, 0), vec2(10, 0)),
      line(vec2(10, 0), vec2(10, 10)),
      line(vec2(10, 10), vec2(0, 10)),
      line(vec2(0, 10), vec2(0, 0)),
    ],
    true,
    counterIds('s'),
  );

describe('reverseContour', () => {
  it('twice gives back the original', () => {
    fc.assert(
      fc.property(anyContour, (c) => {
        expect(reverseContour(reverseContour(c))).toEqual(c);
      }),
    );
  });

  it('keeps every point, ID and smooth flag, and stays valid', () => {
    fc.assert(
      fc.property(anyContour, (c) => {
        const r = reverseContour(c);
        expect(validateContour(r)).toEqual([]);
        expect([...ids(r)].sort()).toEqual([...ids(c)].sort());
        for (const p of r.points) {
          expect(p.smooth).toBe(c.points.find((q) => q.id === p.id)?.smooth);
        }
      }),
    );
  });

  it('traces the same outline backwards', () => {
    fc.assert(
      fc.property(contourArb, (c) => {
        // Last segment first, each one reversed. A closed contour keeps its first point, and the
        // last segment ends there, so no rotation is needed for closed contours either.
        const expected = toSegments(c).map(reverse).reverse();
        expect(sameSegments(toSegments(reverseContour(c)), expected)).toBe(true);
      }),
    );
  });

  it('flips the sign of the area of a closed contour', () => {
    fc.assert(
      fc.property(closedContour, (c) => {
        const a = signedArea(toSegments(c));
        const b = signedArea(toSegments(reverseContour(c)));
        expect(Math.abs(a + b)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(a)));
      }),
    );
  });
});

describe('setStartPoint', () => {
  it('rotates the outline without changing it', () => {
    fc.assert(
      fc.property(closedContour, fc.nat(), (c, k) => {
        const on = onCurveIds(c);
        const id = on.at(k % on.length);
        if (!id) return;
        const moved = setStartPoint(c, id);
        expect(moved.points.at(0)?.id).toBe(id);
        expect(validateContour(moved)).toEqual([]);
        const a = signedArea(toSegments(c));
        expect(signedArea(toSegments(moved))).toBeCloseTo(a, 6);
        expect(toSegments(moved)).toHaveLength(toSegments(c).length);
      }),
    );
  });

  it('refuses open contours and off-curve points', () => {
    const open = contourFromSegments([line(vec2(0, 0), vec2(1, 0))], false, counterIds());
    expect(() => setStartPoint(open, open.points[1]?.id ?? '')).toThrow(RangeError);
    const c = contourFromSegments(
      [cubic(vec2(0, 0), vec2(0, 1), vec2(1, 1), vec2(0, 0))],
      true,
      counterIds(),
    );
    const off = c.points.find((p) => p.type === 'offcurve');
    expect(() => setStartPoint(c, off?.id ?? '')).toThrow(RangeError);
  });
});

describe('openContour and closeContour', () => {
  it('open then close gives the contour started at that point', () => {
    fc.assert(
      fc.property(closedContour, fc.nat(), (c, k) => {
        const on = onCurveIds(c);
        const id = on.at(k % on.length);
        if (!id) return;
        const opened = openContour(c, id, counterIds('new'));
        expect(isClosed(opened)).toBe(false);
        expect(validateContour(opened)).toEqual([]);
        expect(closeContour(opened)).toEqual(setStartPoint(c, id));
      }),
    );
  });

  it('closes with a straight line when the ends do not meet', () => {
    const open = contourFromSegments(
      [line(vec2(0, 0), vec2(10, 0)), line(vec2(10, 0), vec2(10, 10))],
      false,
      counterIds(),
    );
    const closed = closeContour(open);
    expect(isClosed(closed)).toBe(true);
    expect(toSegments(closed).at(-1)).toEqual(line(vec2(10, 10), vec2(0, 0)));
  });
});

describe('insertPoint', () => {
  it('splits one segment and leaves the outline unchanged', () => {
    fc.assert(
      fc.property(anyContour, fc.nat(), t, (c, k, at) => {
        const before = toSegments(c);
        const index = k % before.length;
        const target = before.at(index);
        if (!target) return;
        const { contour, pointId } = insertPoint(c, index, at, counterIds('new'));
        expect(validateContour(contour)).toEqual([]);
        const [a, b] = split(target, at);
        const expected = [...before.slice(0, index), a, b, ...before.slice(index + 1)];
        expect(sameSegments(toSegments(contour), expected)).toBe(true);
        // Every original point is still there, plus the new one.
        for (const id of ids(c)) expect(ids(contour)).toContain(id);
        expect(contour.points.find((p) => p.id === pointId)).toBeDefined();
      }),
    );
  });

  it('marks the new point smooth on curves but not on lines', () => {
    const sq = square();
    const onLine = insertPoint(sq, 0, 0.5, counterIds('n'));
    expect(onLine.contour.points.find((p) => p.id === onLine.pointId)?.smooth).toBeUndefined();
    const curve = contourFromSegments(
      [cubic(vec2(0, 0), vec2(0, 10), vec2(10, 10), vec2(10, 0))],
      false,
      counterIds(),
    );
    const onCurve = insertPoint(curve, 0, 0.5, counterIds('n'));
    const added = onCurve.contour.points.find((p) => p.id === onCurve.pointId);
    expect(added).toMatchObject({ type: 'curve', smooth: true, x: 5, y: 7.5 });
  });

  it('refuses t outside (0, 1) and segments that do not exist', () => {
    expect(() => insertPoint(square(), 0, 0, counterIds())).toThrow(RangeError);
    expect(() => insertPoint(square(), 0, 1, counterIds())).toThrow(RangeError);
    expect(() => insertPoint(square(), 9, 0.5, counterIds())).toThrow(RangeError);
  });
});

describe('makeImpliedPointsExplicit', () => {
  it('adds the implied points without changing the outline', () => {
    fc.assert(
      fc.property(qcurveContourArb, fc.nat(), (c, k) => {
        const runs = contourRuns(c);
        const run = k % runs.length;
        const explicit = makeImpliedPointsExplicit(c, run, counterIds('new'));
        expect(validateContour(explicit)).toEqual([]);
        expect(sameSegments(toSegments(explicit), toSegments(c))).toBe(true);
        const pieces = contourSegments(c).filter((s) => s.run === run).length;
        expect(explicit.points.length - c.points.length).toBe(Math.max(0, pieces - 1));
      }),
    );
  });
});

describe('deletePoint', () => {
  it('always leaves a valid contour or nothing', () => {
    fc.assert(
      fc.property(anyContour, fc.nat(), (c, k) => {
        const id = ids(c).at(k % c.points.length);
        if (!id) return;
        const result = deletePoint(c, id);
        if (result === null) return;
        expect(validateContour(result)).toEqual([]);
        expect(ids(result)).not.toContain(id);
        for (const remaining of ids(result)) expect(ids(c)).toContain(remaining);
        expect(isClosed(result)).toBe(isClosed(c));
        expect(isChain(toSegments(result), isClosed(result))).toBe(true);
      }),
    );
  });

  it('removes an on-curve point with its own handles and keeps the outer ones', () => {
    const c = contourFromSegments(
      [
        cubic(vec2(0, 0), vec2(0, 10), vec2(10, 20), vec2(20, 20)),
        cubic(vec2(20, 20), vec2(30, 20), vec2(40, 10), vec2(40, 0)),
      ],
      false,
      counterIds(),
    );
    const middle = c.points.at(3);
    const result = deletePoint(c, middle?.id ?? '');
    expect(toSegments(result ?? c)).toEqual([
      cubic(vec2(0, 0), vec2(0, 10), vec2(40, 10), vec2(40, 0)),
    ]);
  });

  it('removes the incoming handle too when the next segment is a line', () => {
    // Anchor between a cubic and a line: its own handle (10, 20) goes, the outer one (0, 10)
    // stays, so the joined segment is a quadratic, stored as a 'curve' point with one handle.
    const c = contourFromSegments(
      [cubic(vec2(0, 0), vec2(0, 10), vec2(10, 20), vec2(20, 20)), line(vec2(20, 20), vec2(40, 0))],
      false,
      counterIds(),
    );
    const result = deletePoint(c, c.points.at(3)?.id ?? '');
    expect(result?.points.map((p) => [p.type, p.x, p.y])).toEqual([
      ['move', 0, 0],
      ['offcurve', 0, 10],
      ['curve', 40, 0],
    ]);
  });

  it('turns a cubic into a quadratic when one handle is deleted', () => {
    const c = contourFromSegments(
      [cubic(vec2(0, 0), vec2(0, 10), vec2(10, 10), vec2(10, 0))],
      false,
      counterIds(),
    );
    const result = deletePoint(c, c.points.at(2)?.id ?? '');
    expect(result?.points.map((p) => p.type)).toEqual(['move', 'offcurve', 'curve']);
    expect(toSegments(result ?? c).at(0)?.kind).toBe('quad');
  });

  it('makes the next on-curve point the start when the move point is deleted', () => {
    const c = contourFromSegments(
      [line(vec2(0, 0), vec2(1, 0)), line(vec2(1, 0), vec2(2, 0))],
      false,
      counterIds(),
    );
    const result = deletePoint(c, c.points.at(0)?.id ?? '');
    expect(result?.points.map((p) => [p.type, p.x])).toEqual([
      ['move', 1],
      ['line', 2],
    ]);
  });

  it('returns null when too little is left', () => {
    const c = contourFromSegments([line(vec2(0, 0), vec2(1, 0))], false, counterIds());
    expect(deletePoint(c, c.points.at(1)?.id ?? '')).toBeNull();
  });
});
