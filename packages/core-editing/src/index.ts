import type { Path } from '@vcore/path';

export interface Selection {
  readonly pointIds: ReadonlySet<string>;
}

export const emptySelection = (): Selection => ({ pointIds: new Set() });

export const isEmpty = (selection: Selection, _path: Path): boolean =>
  selection.pointIds.size === 0;
