import type { Contour, Path } from '@vcore/path';
import type { Guide } from './guides';

/** What undo and redo work on: the outline and the guides. */
export interface EditState {
  readonly path: Path;
  readonly guides: readonly Guide[];
}

/** One contour as it was before an edit (null when the edit added it) and as it is after it. */
export interface ContourChange {
  readonly contourId: string;
  readonly before: Contour | null;
  readonly after: Contour;
}

/**
 * One guide before and after an edit: `before` is null when the edit added it, `after` is null
 * when the edit removed it.
 */
export interface GuideChange {
  readonly guideId: string;
  readonly before: Guide | null;
  readonly after: Guide | null;
}

/**
 * One undo step: every contour and guide a single edit (such as one drag) changed. Storing
 * whole contours covers moved points and added or removed points alike.
 */
export interface Change {
  readonly contours: readonly ContourChange[];
  readonly guides: readonly GuideChange[];
}

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

const sameGuide = (a: Guide, b: Guide): boolean => a.axis === b.axis && a.position === b.position;

/**
 * The contour changes that turn `before` into `after`: every contour that differs or was
 * added. Added contours must come after the existing ones. Throws if contours were removed or
 * reordered; no edit does that yet.
 */
export const diffPaths = (before: Path, after: Path): ContourChange[] => {
  if (before.contours.some((c, i) => after.contours[i]?.id !== c.id)) {
    throw new Error('diffPaths: contours were removed or reordered');
  }
  return after.contours.flatMap((c, i): ContourChange[] => {
    const was = before.contours[i];
    if (!was) return [{ contourId: c.id, before: null, after: c }];
    return sameContour(was, c) ? [] : [{ contourId: c.id, before: was, after: c }];
  });
};

/** The guide changes that turn `before` into `after`: guides added, removed or moved. */
export const diffGuides = (before: readonly Guide[], after: readonly Guide[]): GuideChange[] => {
  const old = new Map(before.map((g) => [g.id, g]));
  const now = new Map(after.map((g) => [g.id, g]));
  const changed = after.flatMap((g): GuideChange[] => {
    const was = old.get(g.id);
    return was && sameGuide(was, g) ? [] : [{ guideId: g.id, before: was ?? null, after: g }];
  });
  const removed = before
    .filter((g) => !now.has(g.id))
    .map((g): GuideChange => ({ guideId: g.id, before: g, after: null }));
  return [...changed, ...removed];
};

/** The change that turns one state into another. */
export const diff = (before: EditState, after: EditState): Change => ({
  contours: diffPaths(before.path, after.path),
  guides: diffGuides(before.guides, after.guides),
});

const applyContours = (path: Path, changes: readonly ContourChange[], backwards: boolean) => {
  const byId = new Map(changes.map((c) => [c.contourId, c]));
  const contours = path.contours.flatMap((c) => {
    const changed = byId.get(c.id);
    if (!changed) return [c];
    if (!backwards) return [changed.after];
    return changed.before ? [changed.before] : [];
  });
  if (backwards) return { contours };
  const present = new Set(path.contours.map((c) => c.id));
  const added = changes.filter((c) => c.before === null && !present.has(c.contourId));
  return { contours: [...contours, ...added.map((c) => c.after)] };
};

const applyGuides = (
  guides: readonly Guide[],
  changes: readonly GuideChange[],
  backwards: boolean,
) => {
  const byId = new Map(changes.map((c) => [c.guideId, backwards ? c.before : c.after]));
  const kept = guides.flatMap((g) => {
    if (!byId.has(g.id)) return [g];
    const next = byId.get(g.id);
    return next ? [next] : [];
  });
  const present = new Set(guides.map((g) => g.id));
  const added = [...byId.values()].filter((g): g is Guide => g !== null && !present.has(g.id));
  return [...kept, ...added];
};

/**
 * Applies a change forwards (to the state after) or backwards (to the state before).
 * Added contours and guides are appended going forwards and removed going backwards; removed
 * guides come back at the end.
 */
export const applyChange = (state: EditState, change: Change, backwards = false): EditState => ({
  path: applyContours(state.path, change.contours, backwards),
  guides: applyGuides(state.guides, change.guides, backwards),
});

/** Adds a change as the newest undo step. Empty changes are ignored; redo steps are dropped. */
export const record = (history: History, change: Change): History =>
  change.contours.length === 0 && change.guides.length === 0
    ? history
    : { past: [...history.past, change], future: [] };

/** Undoes the newest step, or returns null when there is nothing to undo. */
export const undo = (
  history: History,
  state: EditState,
): { history: History; state: EditState } | null => {
  const change = history.past.at(-1);
  if (!change) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [change, ...history.future] },
    state: applyChange(state, change, true),
  };
};

/** Redoes the most recently undone step, or returns null when there is nothing to redo. */
export const redo = (
  history: History,
  state: EditState,
): { history: History; state: EditState } | null => {
  const [change, ...rest] = history.future;
  if (!change) return null;
  return {
    history: { past: [...history.past, change], future: rest },
    state: applyChange(state, change),
  };
};
