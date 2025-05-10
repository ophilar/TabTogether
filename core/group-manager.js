// core/group-manager.js

import { storage } from '../core/storage.js';
import { SYNC_STORAGE_KEYS, MAX_DEVICES_PER_GROUP } from '../common/constants.js';
import { getNextAvailableBitPosition } from './bitmask.js';

/**
 * Assigns a unique bit for a device within a specific group.
 * This involves updating the group's assignedMask in GROUP_STATE
 * and the device's groupBits in DEVICE_REGISTRY.
 * Implements optimistic locking with retries for concurrent updates.
 *
 * @param {string} groupName - The name of the new group.
 * @param {string} deviceId - The ID of the device to assign the bit to.
 * @param {object} [initialGroupState] - Optional pre-fetched GROUP_STATE.
 * @returns {Promise<number|null>} The assigned bit (e.g., 1, 2, 4, 8...) or null if assignment failed.
 */
export async function assignDeviceBitForGroup(
  groupName,
  deviceId,
  initialGroupState
) {
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 250; // Increased base delay slightly

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Fetch the current group state for the specific group or use initial if provided on first attempt
      const groupState = attempt === 0 && initialGroupState
        ? initialGroupState
        : await storage.get(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_STATE, {});

      console.log(`[AssignDeviceBit attempt ${attempt + 1}] For group '${groupName}', device '${deviceId}'. Current full groupState:`, JSON.stringify(groupState));

      const currentGroupData = groupState[groupName];
      if (!currentGroupData) {
        console.error(`[AssignDeviceBit attempt ${attempt + 1}] Group ${groupName} does not exist in groupState. Cannot assign bit.`);
        return null;
      }

      const currentAssignedMask = currentGroupData.assignedMask || 0;
      const bitPosition = getNextAvailableBitPosition(currentAssignedMask);

      console.log(`[AssignDeviceBit attempt ${attempt + 1}] Group: ${groupName}, Current mask: ${currentAssignedMask}, Available bit position: ${bitPosition}`);

      if (bitPosition === -1) {
        console.error(`[AssignDeviceBit attempt ${attempt + 1}] Group ${groupName} is full (${MAX_DEVICES_PER_GROUP} devices). Cannot assign bit.`);
        return null;
      }

      const myBit = 1 << bitPosition;

      // Optimistic Lock Check (fetch fresh state for check)
      // Fetch only the specific group's state for the check to be more targeted
      const freshFullGroupState = await storage.get(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.GROUP_STATE,
        {}
      );
      const checkGroupData = freshFullGroupState[groupName];
      console.log(`[AssignDeviceBit attempt ${attempt + 1}] Optimistic check - fresh data for ${groupName}:`, JSON.stringify(checkGroupData));

      if (!checkGroupData) {
        console.warn(`[AssignDeviceBit attempt ${attempt + 1}] Group state for ${groupName} missing during optimistic check. Retrying...`);
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      // If the bit is now taken, retry
      if (((checkGroupData.assignedMask >> bitPosition) & 1) !== 0) {
        console.warn(`[AssignDeviceBit attempt ${attempt + 1}] Race condition: bit ${bitPosition} for group ${groupName} is now taken (mask ${checkGroupData.assignedMask}). Retrying...`);
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Proceed with update
      const newAssignedMaskForGroup = checkGroupData.assignedMask | myBit; // Use the mask from the fresh check
      const groupStateUpdate = { [groupName]: { assignedMask: newAssignedMaskForGroup } };
      console.log(`[AssignDeviceBit attempt ${attempt + 1}] Attempting to merge GROUP_STATE for ${groupName} with mask: ${newAssignedMaskForGroup}`);

      const groupStateMergeResult = await storage.mergeItem(
        browser.storage.sync,
        SYNC_STORAGE_KEYS.GROUP_STATE,
        groupStateUpdate
      );

      if (groupStateMergeResult.success) {
        console.log(`[AssignDeviceBit attempt ${attempt + 1}] GROUP_STATE merge successful for ${groupName}.`);
        // Update DEVICE_REGISTRY immediately
        const registryUpdate = {
          [deviceId]: { groupBits: { [groupName]: myBit } },
        };
        console.log(`[AssignDeviceBit attempt ${attempt + 1}] Attempting to merge DEVICE_REGISTRY for device ${deviceId}, group ${groupName}, bit ${myBit}`);
        await storage.mergeItem(
          browser.storage.sync,
          SYNC_STORAGE_KEYS.DEVICE_REGISTRY,
          registryUpdate
        );
        console.log(`[AssignDeviceBit attempt ${attempt + 1}] Successfully assigned bit ${myBit} (pos ${bitPosition}) to device ${deviceId} for group ${groupName}.`);
        return myBit;
      } else {
        console.error(`[AssignDeviceBit attempt ${attempt + 1}] Failed to merge GROUP_STATE for ${groupName}. Retrying...`);
        // Use exponential backoff for retry
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    } catch (error) {
      console.error(`[AssignDeviceBit attempt ${attempt + 1}] Error during bit assignment for ${groupName}:`, error);
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * BASE_DELAY_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`[AssignDeviceBit] Failed to assign bit for group ${groupName} to device ${deviceId} after ${MAX_RETRIES} retries.`);
  return null;
}