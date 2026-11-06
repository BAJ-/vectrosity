import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cubic, endPoint, line, quad, vec2 } from '@vcore/geometry';
import { counterIds } from './ids';
import { validateContour, type Contour } from './model';
import { contourRuns } from './runs';
import { contourFromSegments, contourSegments, toSegments } from './segments';
import { qcurveContourArb, segmentChainArb } from './testing/arbitraries';
import { isChain, sameSegments } from './testing/outline';

describe('contourFromSegments and toSegments', () => {
  it('round-trip an open chain exactly', () => {
    fc.assert(
      fc.property(segmentChainArb, (segments) => {
        const c = contourFromSegments(segments, false, counterIds());
        expect(validateContour(c)).toEqual([]);
        expect(toSegments(c)).toEqual(segments);
      }),
    );
  });

  it('round-trip a closed loop exactly', () => {
    fc.assert(
      fc.property(segmentChainArb, (chain) => {
        const first = chain.at(0);
        const last = chain.at(-1);
        if (!first || !last) return;
        // Close the loop with a straight line back to the start.
        const loop = [...chain, line(endPoint(last), first.p0)];
        const c = contourFromSegments(loop, true, counterIds());
        expect(validateContour(c)).toEqual([]);
        expect(toSegments(c)).toEqual(loop);
      }),
    );
  });

  it('adds the implied closing line when a closed chain does not end at its start', () => {
    const segments = [line(vec2(0, 0), vec2(10, 0)), line(vec2(10, 0), vec2(10, 10))];
    const c = contourFromSegments(segments, true, counterIds());
    expect(c.points.map((p) => p.type)).toEqual(['line', 'line', 'line']);
    expect(toSegments(c)).toEqual([...segments, line(vec2(10, 10), vec2(0, 0))]);
  });

  it('writes points in UFO form', () => {
    const s = [
      cubic(vec2(0, 0), vec2(0, 10), vec2(10, 10), vec2(10, 0)),
      quad(vec2(10, 0), vec2(5, -5), vec2(0, 0)),
    ];
    const c = contourFromSegments(s, true, counterIds());
    expect(c.points.map((p) => p.type)).toEqual([
      'qcurve',
      'offcurve',
      'offcurve',
      'curve',
      'offcurve',
    ]);
  });

  it('rejects an empty list', () => {
    expect(() => contourFromSegments([], false, counterIds())).toThrow(RangeError);
  });
});

describe('qcurve runs', () => {
  it('make one quadratic per off-curve point, joined at implied midpoints', () => {
    const c: Contour = {
      id: 'c',
      points: [
        { id: 'a', x: 0, y: 0, type: 'qcurve' },
        { id: 'b', x: 0, y: 10, type: 'offcurve' },
        { id: 'd', x: 10, y: 10, type: 'offcurve' },
        { id: 'e', x: 10, y: 0, type: 'offcurve' },
      ],
    };
    const segments = toSegments(c);
    expect(segments).toEqual([
      quad(vec2(0, 0), vec2(0, 10), vec2(5, 10)),
      quad(vec2(5, 10), vec2(10, 10), vec2(10, 5)),
      quad(vec2(10, 5), vec2(10, 0), vec2(0, 0)),
    ]);
    expect(contourSegments(c).map((s) => [s.piece, s.pieces])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });

  it('always form a closed chain, even when the contour starts with off-curve points', () => {
    fc.assert(
      fc.property(qcurveContourArb, (c) => {
        expect(validateContour(c)).toEqual([]);
        const segments = toSegments(c);
        expect(segments.length).toBeGreaterThan(0);
        expect(isChain(segments, true)).toBe(true);
      }),
    );
  });

  it('treat a curve point with one handle as a quadratic', () => {
    const c: Contour = {
      id: 'c',
      points: [
        { id: 'a', x: 0, y: 0, type: 'move' },
        { id: 'b', x: 5, y: 5, type: 'offcurve' },
        { id: 'd', x: 10, y: 0, type: 'curve' },
      ],
    };
    expect(toSegments(c)).toEqual([quad(vec2(0, 0), vec2(5, 5), vec2(10, 0))]);
  });
});

describe('contourRuns', () => {
  it('has one run per segment-producing stretch, ending back at the start when closed', () => {
    const c = contourFromSegments(
      [line(vec2(0, 0), vec2(1, 0)), line(vec2(1, 0), vec2(0, 0))],
      true,
      counterIds(),
    );
    const runs = contourRuns(c);
    expect(runs).toHaveLength(2);
    expect(runs.at(-1)?.end).toBe(0);
  });

  it('round-trips random chains through segments without changing them', () => {
    fc.assert(
      fc.property(segmentChainArb, fc.boolean(), (segments, closed) => {
        const c = contourFromSegments(segments, closed, counterIds());
        const again = contourFromSegments(toSegments(c), closed, counterIds());
        expect(sameSegments(toSegments(again), toSegments(c))).toBe(true);
      }),
    );
  });
});
