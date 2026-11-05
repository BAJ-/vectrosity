import { expect, it } from 'vitest';
import { emptyPath } from './index';

it('creates an empty path', () => {
  expect(emptyPath().contours).toHaveLength(0);
});
