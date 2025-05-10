export const MAX_DEVICES_PER_GROUP = 16;

/**
 * Finds the next available bit position in a bitmask.
 * @param {number} currentMask - The current bitmask.
 * @returns {number} The position (0-indexed) of the next available bit, or -1 if full.
 */

export const getNextAvailableBitPosition = (mask) => {
  for (let i = 0; i < MAX_DEVICES_PER_GROUP; i++) {
    if (!((mask >> i) & 1)) {
      // Check if bit i is 0
      return i;
    }
  }
  return -1; // No available bits
};