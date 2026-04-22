import { jest } from '@jest/globals';
import { deepMerge, ensureObject, ensureArray, ensureString, isObject, debounce } from '../common/utils.js';

describe('utils', () => {
    // --- TESTS ---
    describe('Core Utilities', () => {
        test('deepMerge merges deeply and deletes keys', () => {
            const a = { foo: { bar: 1 }, baz: 2 };
            const b = { foo: { bar: 2 }, baz: null };
            expect(deepMerge(a, b)).toEqual({ foo: { bar: 2 } });
        });

        test('deepMerge overwrites arrays', () => {
            const a = { list: [1, 2] };
            const b = { list: [3] };
            expect(deepMerge(a, b)).toEqual({ list: [3] });
        });

        test('deepMerge handles non-object targets', () => {
            expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
            expect(deepMerge(1, { a: 1 })).toEqual({ a: 1 });
        });

        test('deepMerge handles non-object sources', () => {
            expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
            expect(deepMerge({ a: 1 }, 1)).toEqual({ a: 1 });
        });
    });

    describe('Type Safety Helpers', () => {
        describe('ensureObject', () => {
            test('returns object when valid', () => {
                expect(ensureObject({ a: 1 })).toEqual({ a: 1 });
            });
            test('returns default fallback for null or undefined', () => {
                expect(ensureObject(null)).toEqual({});
                expect(ensureObject(undefined)).toEqual({});
            });
            test('returns default fallback for non-objects', () => {
                expect(ensureObject('string')).toEqual({});
                expect(ensureObject(123)).toEqual({});
                expect(ensureObject(true)).toEqual({});
                expect(ensureObject(() => {})).toEqual({});
            });
            test('returns default fallback for arrays', () => {
                expect(ensureObject([1, 2])).toEqual({});
            });
            test('returns custom fallback when provided', () => {
                const fallback = { default: true };
                expect(ensureObject(null, fallback)).toEqual(fallback);
                expect(ensureObject([], fallback)).toEqual(fallback);
            });
        });

        describe('ensureArray', () => {
            test('returns array when valid', () => {
                expect(ensureArray([1, 2])).toEqual([1, 2]);
            });
            test('returns default fallback for non-arrays', () => {
                expect(ensureArray(null)).toEqual([]);
                expect(ensureArray(undefined)).toEqual([]);
                expect(ensureArray({})).toEqual([]);
                expect(ensureArray('string')).toEqual([]);
                expect(ensureArray(123)).toEqual([]);
            });
            test('returns custom fallback when provided', () => {
                const fallback = [9];
                expect(ensureArray(null, fallback)).toEqual(fallback);
                expect(ensureArray({}, fallback)).toEqual(fallback);
            });
        });

        describe('ensureString', () => {
            test('returns string when valid', () => {
                expect(ensureString('test')).toBe('test');
                expect(ensureString('')).toBe('');
            });
            test('returns default fallback for non-strings', () => {
                expect(ensureString(null)).toBe('');
                expect(ensureString(undefined)).toBe('');
                expect(ensureString(123)).toBe('');
                expect(ensureString({})).toBe('');
                expect(ensureString([])).toBe('');
            });
            test('returns custom fallback when provided', () => {
                expect(ensureString(null, 'fallback')).toBe('fallback');
            });
        });

        describe('isObject', () => {
            test('returns true for plain objects', () => {
                expect(isObject({ a: 1 })).toBe(true);
                expect(isObject({})).toBe(true);
            });
            test('returns false for null', () => {
                expect(isObject(null)).toBe(false);
            });
            test('returns false for arrays', () => {
                expect(isObject([])).toBe(false);
                expect(isObject([1, 2])).toBe(false);
            });
            test('returns false for other types', () => {
                expect(isObject('string')).toBe(false);
                expect(isObject(123)).toBe(false);
                expect(isObject(undefined)).toBe(false);
                expect(isObject(() => {})).toBe(false);
            });
        });
    });

    describe('Debounce', () => {
        test('debounces function calls', (done) => {
            const mockFn = jest.fn();
            const debouncedFn = debounce(mockFn, 100);

            debouncedFn();
            debouncedFn();
            debouncedFn();

            expect(mockFn).not.toHaveBeenCalled();

            setTimeout(() => {
                expect(mockFn).toHaveBeenCalledTimes(1);
                done();
            }, 150);
        });
    });
});
