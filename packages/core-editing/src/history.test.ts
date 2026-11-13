import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { vec2 } from '@vcore/geometry';
import { point } from '@vcore/geometry/testing';
import { counterIds, fromSvgPath } from '@vcore/path';
import type { Guide } from './guides';
import {
  applyChange,
  diff,
  diffGuides,
  emptyHistory,
  record,
  redo,
  undo,
  type EditState,
} from './history';
import { movePoints } from './drag';

const square = () => fromSvgPath('M0 0 L10 0 L10 10 L0 10 Z', counterIds());
const ids = (path: ReturnType<typeof square>) =>
  path.contours.flatMap((c) => c.points.map((p) => p.id));
const guide = (id: string, position: number): Guide => ({ id, axis: 'y', position });
const state = (guides: Guide[] = []): EditState => ({ path: square(), guides });

describe('history', () => {
  it('undoes and redoes a change', () => {
    const before = state();
    const after = {
      ...before,
      path: movePoints(before.path, new Set(ids(before.path).slice(0, 1)), vec2(5, 5)),
    };
    expect(after).not.toEqual(before);
    const history = record(emptyHistory, diff(before, after));
    const undone = undo(history, after);
    expect(undone?.state).toEqual(before);
    const redone = redo(undone?.history ?? history, undone?.state ?? after);
    expect(redone?.state).toEqual(after);
  });

  it('returns null when there is nothing to undo or redo', () => {
    expect(undo(emptyHistory, state())).toBeNull();
    expect(redo(emptyHistory, state())).toBeNull();
  });

  it('ignores empty changes and drops redo steps after a new change', () => {
    const start = state();
    const [first = '', second = ''] = ids(start.path);
    expect(record(emptyHistory, diff(start, start))).toBe(emptyHistory);
    const moved = { ...start, path: movePoints(start.path, new Set([first]), vec2(1, 0)) };
    const h1 = record(emptyHistory, diff(start, moved));
    const undone = undo(h1, moved);
    expect(undone?.history.future).toHaveLength(1);
    const other = { ...start, path: movePoints(start.path, new Set([second]), vec2(0, 1)) };
    const h2 = record(undone?.history ?? h1, diff(start, other));
    expect(h2.future).toEqual([]);
  });

  it('undoing every step of any sequence of moves gives back the start', () => {
    const step = fc.tuple(fc.nat(), point);
    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 8 }), (steps) => {
        const start = state([guide('g', 0)]);
        const all = ids(start.path);
        let current = start;
        let history = emptyHistory;
        for (const [k, delta] of steps) {
          const next: EditState = {
            path: movePoints(current.path, new Set([all[k % all.length] ?? '']), delta),
            guides: [guide('g', delta.y)],
          };
          history = record(history, diff(current, next));
          current = next;
        }
        for (let r = undo(history, current); r; r = undo(r.history, r.state)) current = r.state;
        expect(current).toEqual(start);
      }),
    );
  });

  it('applies a change forwards and backwards', () => {
    const before = state();
    const after = {
      ...before,
      path: movePoints(before.path, new Set(ids(before.path).slice(0, 2)), vec2(3, 4)),
    };
    const change = diff(before, after);
    expect(applyChange(before, change)).toEqual(after);
    expect(applyChange(after, change, true)).toEqual(before);
  });

  it('records nothing when nothing changed', () => {
    const start = state();
    expect(diff(start, { ...start, path: movePoints(start.path, new Set(), vec2(1, 1)) })).toEqual({
      contours: [],
      guides: [],
    });
  });
});

describe('history of guides', () => {
  it('records moved, added and removed guides', () => {
    const before = [guide('a', 0), guide('b', 10)];
    const after = [guide('a', 5), guide('c', 20)];
    expect(diffGuides(before, after)).toEqual([
      { guideId: 'a', before: guide('a', 0), after: guide('a', 5) },
      { guideId: 'c', before: null, after: guide('c', 20) },
      { guideId: 'b', before: guide('b', 10), after: null },
    ]);
  });

  it('undoes and redoes adding, moving and removing a guide', () => {
    const start = state([guide('a', 0)]);
    const steps: Guide[][] = [
      [guide('a', 0), guide('b', 10)],
      [guide('a', 0), guide('b', 30)],
      [guide('a', 0)],
    ];
    let current = start;
    let history = emptyHistory;
    for (const guides of steps) {
      const next = { ...current, guides };
      history = record(history, diff(current, next));
      current = next;
    }
    const undone = [current];
    for (let r = undo(history, current); r; r = undo(r.history, r.state)) {
      undone.push(r.state);
      history = r.history;
      current = r.state;
    }
    expect(undone.map((s) => s.guides)).toEqual([...[...steps].reverse(), start.guides]);
    expect(redo(history, current)?.state.guides).toEqual(steps[0]);
  });
});
