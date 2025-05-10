import { storage } from '../../core/storage.js'; // Corrected import path
import { SYNC_STORAGE_KEYS, STRINGS } from '../../common/constants.js'; // Added SYNC_STORAGE_KEYS
import { assignBitForGroup } from '../../core/group-manager.js';

export async function handleCreateGroup(requestData) {
    const { groupName } = requestData;
    if (!groupName || typeof groupName !== 'string' || groupName.trim() === '') {
        throw new Error('Invalid group name provided.');
    }

    const {
        [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: currentGroups, // Use SYNC_STORAGE_KEYS
        [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: currentSubscriptions // Use SYNC_STORAGE_KEYS
    } = await storage.getItems([SYNC_STORAGE_KEYS.DEFINED_GROUPS, SYNC_STORAGE_KEYS.SUBSCRIPTIONS]); // Use SYNC_STORAGE_KEYS

    const { bit, updatedGroups, updatedSubscriptions } = await assignBitForGroup(groupName.trim(), currentGroups, currentSubscriptions);

    await storage.setItems({
        [SYNC_STORAGE_KEYS.DEFINED_GROUPS]: updatedGroups, // Use SYNC_STORAGE_KEYS
        [SYNC_STORAGE_KEYS.SUBSCRIPTIONS]: updatedSubscriptions // Use SYNC_STORAGE_KEYS
    });

    return { bit, groupName: groupName.trim() }; // Return data for the response
}

// export async function handleAddTabToGroup(requestData) { ... }
// export async function handleDeleteGroup(requestData) { ... }
// ... other group-related action handlers