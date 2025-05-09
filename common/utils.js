// utils.js

// --- Type Safety and Validation Helpers ---
export const ensureObject = (val, fallback = {}) =>
  val && typeof val === "object" && !Array.isArray(val) ? val : fallback;
export const ensureArray = (val, fallback = []) =>
  Array.isArray(val) ? val : fallback;
export const ensureString = (val, fallback = "") =>
  typeof val === "string" ? val : fallback;
export const isObject = (item) =>
  !!item && typeof item === "object" && !Array.isArray(item);

/**
 * A utility to deeply merge objects.
 * - If a key in the source has a value of `null`, the key is deleted from the target.
 * - Arrays from the source will overwrite arrays in the target.
 * - Objects will be recursively merged.
 * @param {object} target The target object to merge into.
 * @param {object} source The source object to merge from.
 * @returns {object} The merged target object.
 * This version is more robust, handling null for deletion and ensuring target is an object.
 */
export function deepMerge(target, source) {
  const output = { ...ensureObject(target) }; // Ensure output starts as a copy of an object

  if (isObject(source)) { // Use isObject from this module
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = output[key];

      if (sourceValue === null) {
        // Explicit deletion
        delete output[key];
      } else if (isObject(sourceValue)) { // Use isObject from this module
        // Recurse only if target value is also an object
        output[key] = isObject(targetValue) ? deepMerge(targetValue, sourceValue) : sourceValue;
      } else {
        // Assign non-object values directly (overwriting target)
        output[key] = sourceValue;
      }
    });
  }
  return output;
}

// --- Debounce Utility --- (Used by theme.js)
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
