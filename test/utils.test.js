// Automated tests for utils.js
import * as utils from '../utils.js';

test('deepMerge merges objects correctly', () => {
  const a = { foo: { bar: 1 }, baz: 2 };
  const b = { foo: { bar: 2 }, baz: null };
  const result = utils.deepMerge(a, b);
  expect(result).toEqual({ foo: { bar: 2 } });
});

test('isObject returns true for objects', () => {
  expect(utils.isObject({})).toBe(true);
  expect(utils.isObject([])).toBe(false);
  expect(utils.isObject(null)).toBe(false);
});
