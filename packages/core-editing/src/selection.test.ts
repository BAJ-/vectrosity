import { describe, expect, it } from 'vitest';
import { counterIds, fromSvgPath } from '@vcore/path';
import { contourPointIds, segmentEnds, toggleSelection } from './selection';

describe('selection helpers', () => {
  // Points: p1 (0,0), p2 (10,0), handles p3 p4, p5 (0,10); closed.
  const path = fromSvgPath('M0 0 L10 0 C10 5 5 10 0 10 Z', counterIds());
  const contour = path.contours[0];
  const id = contour?.id ?? '';
  const ids = contour?.points.map((p) => p.id) ?? [];

  it('gives the anchors at both ends of a segment', () => {
    expect(segmentEnds(path, id, 0)).toEqual([ids[0], ids[1]]);
    expect(segmentEnds(path, id, 1)).toEqual([ids[1], ids[4]]);
    // The closing line runs from the last anchor back to the first.
    expect(segmentEnds(path, id, 2)).toEqual([ids[4], ids[0]]);
    expect(segmentEnds(path, id, 9)).toEqual([]);
  });

  it('gives every point of a contour', () => {
    expect(contourPointIds(path, id)).toEqual(ids);
    expect(contourPointIds(path, 'nope')).toEqual([]);
  });

  it('adds ids, or removes them when they are all selected already', () => {
    const added = toggleSelection(new Set(['a']), ['a', 'b']);
    expect([...added]).toEqual(['a', 'b']);
    expect([...toggleSelection(added, ['a', 'b'])]).toEqual([]);
  });
});
