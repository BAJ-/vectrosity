import { contourRuns, type Path } from '@vcore/path';

/**
 * The ids of the two anchors at the ends of a segment (a run), or none if there is no such
 * run. Selecting a segment selects its ends, so moving the selection moves the segment.
 */
export const segmentEnds = (path: Path, contourId: string, run: number): string[] => {
  const c = path.contours.find((k) => k.id === contourId);
  const r = c && contourRuns(c).at(run);
  if (!c || !r) return [];
  return [r.start, r.end].flatMap((i) => c.points[i]?.id ?? []);
};

/** The ids of every point of a contour: selecting a contour selects all of it. */
export const contourPointIds = (path: Path, contourId: string): string[] =>
  path.contours.find((c) => c.id === contourId)?.points.map((p) => p.id) ?? [];

/** The selection with `ids` added, or removed when they are all selected already (shift-click). */
export const toggleSelection = (
  selection: ReadonlySet<string>,
  ids: readonly string[],
): Set<string> => {
  const next = new Set(selection);
  const allIn = ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allIn) next.delete(id);
    else next.add(id);
  }
  return next;
};
