import { STRINGS } from '../common/constants.js';
import { storage } from '../common/storage.js';

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
export async function assignBitForGroup(groupName, currentGroups, currentSubscriptions) {
    // Ensure currentGroups and currentSubscriptions are initialized if they were null/undefined
    const groups = currentGroups || {};
    const subscriptions = currentSubscriptions || {};

    // Example: Check if group name already exists (you might have this logic already)
    if (Object.values(groups).some(g => g.name === groupName)) {
        throw new Error(`Group with name "${groupName}" already exists.`);
    }

    // Placeholder for your actual bit assignment logic:
    // This would involve finding an unused bit, potentially managing a pool of available bits,
    // and updating the groups and subscriptions objects accordingly.
    console.log('Core: Assigning bit for group:', groupName);
    const newBit = Math.floor(Math.random() * 1000) + 1; // Replace with actual logic

    // Example of updating structures (adapt to your actual data model)
    const updatedGroups = { ...groups, [newBit]: { name: groupName, tabs: [] } };
    const updatedSubscriptions = { ...subscriptions, [newBit]: { subscribed: true, lastSynced: Date.now() } };

    // Note: This function itself might not directly call storage.setItems.
    // The caller (e.g., a message handler in background.js) would typically handle storage persistence.
    return { bit: newBit, updatedGroups, updatedSubscriptions };
}