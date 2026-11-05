import { expect, it } from 'vitest';
import { emptyPath } from '@vcore/path';
import { emptySelection, isEmpty } from './index';

it('starts with nothing selected', () => {
  expect(isEmpty(emptySelection(), emptyPath())).toBe(true);
});
