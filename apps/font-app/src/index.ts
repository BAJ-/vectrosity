import { emptySelection, isEmpty } from '@vcore/editing';
import { vec2 } from '@vcore/geometry';
import { emptyPath } from '@vcore/path';

// Placeholder: proves the app can import every core package.
export const smokeTest = (): boolean => {
  const origin = vec2(0, 0);
  return origin.x === 0 && isEmpty(emptySelection(), emptyPath());
};
