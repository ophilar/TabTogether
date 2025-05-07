// utils.js

import { STRINGS } from "./constants.js"; // Assuming STRINGS might be used by future utils

// --- Type Safety and Validation Helpers ---
export const ensureObject = (val, fallback = {}) =>
  val && typeof val === "object" && !Array.isArray(val) ? val : fallback;
export const ensureArray = (val, fallback = []) =>
  Array.isArray(val) ? val : fallback;
export const ensureString = (val, fallback = "") =>
  typeof val === "string" ? val : fallback;
export const isObject = (item) =>
  !!item && typeof item === "object" && !Array.isArray(item);


// --- Debounce Utility --- (Used by theme.js)
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
