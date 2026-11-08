import type { Contour, Path } from '@vcore/path';

/** One contour as it was before an edit and as it is after it. */
export interface ContourChange {
  readonly contourId: string;
  readonly before: Contour;
  readonly after: Contour;
}

/**
 * One undo step: every contour a single edit (such as one drag) changed. Storing whole
 * contours covers moved points and added or removed points alike.
 */
export type Change = readonly ContourChange[];

export interface History {
  readonly past: readonly Change[];
  readonly future: readonly Change[];
}

export const emptyHistory: History = { past: [], future: [] };

const sameContour = (a: Contour, b: Contour): boolean =>
  a === b ||
  (a.points.length === b.points.length &&
    a.points.every((p, i) => {
      const q = b.points[i];
      return (
        q !== undefined &&
        p.id === q.id &&
        p.x === q.x &&
        p.y === q.y &&
        p.type === q.type &&
        p.smooth === q.smooth
      );
    }));

/** Applies a change forwards (to the contours after) or backwards (to the contours before). */
export const applyChange = (path: Path, change: Change, backwards = false): Path => {
  const byId = new Map(change.map((c) => [c.contourId, backwards ? c.before : c.after]));
  return { contours: path.contours.map((c) => byId.get(c.id) ?? c) };
};

/**
 * The change that turns `before` into `after`: every contour that differs.
 * Throws if contours were added or removed; no edit does that yet.
 */
export const diffPaths = (before: Path, after: Path): Change => {
  const ids = (p: Path) => p.contours.map((c) => c.id).join(' ');
  if (ids(before) !== ids(after)) throw new Error('diffPaths: contours were added or removed');
  return after.contours.flatMap((c, i) => {
    const was = before.contours[i];
    return was && !sameContour(was, c) ? [{ contourId: c.id, before: was, after: c }] : [];
  });
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
