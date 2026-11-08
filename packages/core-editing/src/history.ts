import type { Vec2 } from '@vcore/geometry';
import type { Path } from '@vcore/path';

/** One point moved from one position to another. */
export interface PointMove {
  readonly pointId: string;
  readonly from: Vec2;
  readonly to: Vec2;
}

/** One undo step: every point a single edit (such as one drag) moved. */
export type Change = readonly PointMove[];

export interface History {
  readonly past: readonly Change[];
  readonly future: readonly Change[];
}

export const emptyHistory: History = { past: [], future: [] };

const setPositions = (path: Path, positions: ReadonlyMap<string, Vec2>): Path => ({
  contours: path.contours.map((c) => ({
    ...c,
    points: c.points.map((p) => {
      const at = positions.get(p.id);
      return at ? { ...p, x: at.x, y: at.y } : p;
    }),
  })),
});

/** Applies a change forwards (to the new positions) or backwards (to the old ones). */
export const applyChange = (path: Path, change: Change, backwards = false): Path =>
  setPositions(path, new Map(change.map((m) => [m.pointId, backwards ? m.from : m.to])));

/** The change that turns `before` into `after`: every point whose position differs. */
export const diffPositions = (before: Path, after: Path): Change => {
  const old = new Map(before.contours.flatMap((c) => c.points.map((p) => [p.id, p] as const)));
  return after.contours.flatMap((c) =>
    c.points.flatMap((p) => {
      const was = old.get(p.id);
      return was && (was.x !== p.x || was.y !== p.y)
        ? [{ pointId: p.id, from: { x: was.x, y: was.y }, to: { x: p.x, y: p.y } }]
        : [];
    }),
  );
};

/** Adds a change as the newest undo step. Empty changes are ignored; redo steps are dropped. */
export const record = (history: History, change: Change): History =>
  change.length === 0 ? history : { past: [...history.past, change], future: [] };

/** Undoes the newest step, or returns null when there is nothing to undo. */
export const undo = (history: History, path: Path): { history: History; path: Path } | null => {
  const change = history.past.at(-1);
  if (!change) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [change, ...history.future] },
    path: applyChange(path, change, true),
  };
};

/** Redoes the most recently undone step, or returns null when there is nothing to redo. */
export const redo = (history: History, path: Path): { history: History; path: Path } | null => {
  const [change, ...rest] = history.future;
  if (!change) return null;
  return {
    history: { past: [...history.past, change], future: rest },
    path: applyChange(path, change),
  };
};
