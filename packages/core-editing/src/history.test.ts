import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { vec2 } from '@vcore/geometry';
import { point } from '@vcore/geometry/testing';
import { counterIds, fromSvgPath } from '@vcore/path';
import { applyChange, diffPaths, emptyHistory, record, redo, undo } from './history';
import { movePoints } from './drag';

const square = () => fromSvgPath('M0 0 L10 0 L10 10 L0 10 Z', counterIds());
const ids = (path: ReturnType<typeof square>) =>
  path.contours.flatMap((c) => c.points.map((p) => p.id));

describe('history', () => {
  it('undoes and redoes a change', () => {
    const before = square();
    const after = movePoints(before, new Set(ids(before).slice(0, 1)), vec2(5, 5));
    expect(after).not.toEqual(before);
    const history = record(emptyHistory, diffPaths(before, after));
    const undone = undo(history, after);
    expect(undone?.path).toEqual(before);
    const redone = redo(undone?.history ?? history, undone?.path ?? after);
    expect(redone?.path).toEqual(after);
  });

  it('returns null when there is nothing to undo or redo', () => {
    expect(undo(emptyHistory, square())).toBeNull();
    expect(redo(emptyHistory, square())).toBeNull();
  });

  it('ignores empty changes and drops redo steps after a new change', () => {
    const path = square();
    const [first = '', second = ''] = ids(path);
    expect(record(emptyHistory, [])).toBe(emptyHistory);
    const moved = movePoints(path, new Set([first]), vec2(1, 0));
    const h1 = record(emptyHistory, diffPaths(path, moved));
    const undone = undo(h1, moved);
    expect(undone?.history.future).toHaveLength(1);
    const other = movePoints(path, new Set([second]), vec2(0, 1));
    const h2 = record(undone?.history ?? h1, diffPaths(path, other));
    expect(h2.future).toEqual([]);
  });

  it('undoing every step of any sequence of moves gives back the start', () => {
    const step = fc.tuple(fc.nat(), point);
    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 8 }), (steps) => {
        const start = square();
        const all = ids(start);
        let path = start;
        let history = emptyHistory;
        for (const [k, delta] of steps) {
          const next = movePoints(path, new Set([all[k % all.length] ?? '']), delta);
          history = record(history, diffPaths(path, next));
          path = next;
        }
        for (let r = undo(history, path); r; r = undo(r.history, r.path)) path = r.path;
        expect(path).toEqual(start);
      }),
    );
  });

  it('applies a change backwards', () => {
    const path = square();
    const moved = movePoints(path, new Set(ids(path).slice(0, 2)), vec2(3, 4));
    const change = diffPaths(path, moved);
    expect(applyChange(path, change)).toEqual(moved);
    expect(applyChange(moved, change, true)).toEqual(path);
  });

  it('records nothing when nothing changed', () => {
    const path = square();
    expect(diffPaths(path, movePoints(path, new Set(), vec2(1, 1)))).toEqual([]);
  });
});
