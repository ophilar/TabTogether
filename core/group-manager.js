import { storage } from '../core/storage.js';

/**
 * Assigns a unique bit (identifier) for a new group.
 * This function encapsulates the logic for finding an available bit,
 * updating group and subscription data structures.
 *
 * @param {string} groupName - The name of the new group.
 * @param {object} currentGroups - The current groups object from storage.
 * @param {object} currentSubscriptions - The current subscriptions object from storage.
 * @returns {Promise<{bit: number, updatedGroups: object, updatedSubscriptions: object}>}
 *          The assigned bit and the updated groups and subscriptions objects.
 * @throws {Error} If a group with the same name already exists or no bits are available.
 */
async function assignBitForGroup(
  groupName,
  localInstanceId,
  cachedGroupState,
) {
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 250; // Increased base delay slightly
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const groupState =
        cachedGroupState ??
        (await storage.get(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.GROUP_STATE,
          {}
        ));
      console.log(`[AssignBit attempt ${attempt + 1}] Fetched groupState:`, JSON.stringify(groupState));
      const currentGroupData = groupState[groupName];
      if (!currentGroupData) {
        console.error(
          `Group ${groupName} does not exist in groupState. Cannot assign bit.`
        );
        return null;
      }
      const currentAssignedMask = currentGroupData.assignedMask;
      const bitPosition = getNextAvailableBitPosition(currentAssignedMask);
      console.log(`[AssignBit attempt ${attempt + 1}] Group: ${groupName}, Current mask: ${currentAssignedMask}, Available pos: ${bitPosition}`);
      if (bitPosition === -1) {
        console.error(
          `Group ${groupName} is full (${MAX_DEVICES_PER_GROUP} devices). Cannot assign bit.`
        );
        return null; // Or throw new Error("Group is full");
      }
      const myBit = 1 << bitPosition;
      // Optimistic Lock Check (fetch fresh state for check)
      const checkGroupState = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.GROUP_STATE,
        {}
      );
      console.log(`[AssignBit attempt ${attempt + 1}] Optimistic check groupState for ${groupName}:`, JSON.stringify(checkGroupState[groupName]));
      const checkGroupData = checkGroupState[groupName];
      if (!checkGroupData) {
        console.warn(
          `Group state for ${groupName} missing during bit assignment. Retrying...`
        );
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // If the bit is now taken, retry
      if (((checkGroupData.assignedMask >> bitPosition) & 1) !== 0) {
        console.warn(
          `[AssignBit attempt ${attempt + 1}] Race condition: bit ${bitPosition} for group ${groupName} is now taken (mask ${checkGroupData.assignedMask}). Retrying...`
        );
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // Proceed with update
      const newAssignedMask = currentAssignedMask | myBit;
      const update = { [groupName]: { assignedMask: newAssignedMask } };
      console.log(`[AssignBit attempt ${attempt + 1}] Attempting merge for ${groupName} mask: ${newAssignedMask}`);
      const success = await mergeSyncStorage(
        SYNC_STORAGE_KEYS.GROUP_STATE,
        update
      );
      if (success) {
        // Update registry immediately
        const registryUpdate = {
          [localInstanceId]: { groupBits: { [groupName]: myBit } },
        };
        await mergeSyncStorage(
          SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
          registryUpdate
        );
     
        console.log(
          `[AssignBit attempt ${attempt + 1}] Assigned bit ${myBit} (pos ${bitPosition}) to device ${localInstanceId} for group ${groupName}`
        );
        return myBit;
      } else {
        console.error(
          `Failed to merge group state for ${groupName} during bit assignment. Retrying...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 50 + Math.random() * 100)
        );
        continue;
      }
    } catch (error) {
      console.error(
        `Error during bit assignment attempt ${attempt + 1} for ${groupName}:`,
        error
      );
      if (attempt < MAX_RETRIES - 1) {
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(
    `Failed to assign bit for ${groupName} after ${MAX_RETRIES} retries.`
  );
  return null; // Or throw new Error("Failed to assign bit after multiple retries");
}