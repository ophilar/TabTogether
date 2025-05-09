import { storage } from '../../common/storage.js';
import { STRINGS } from '../../common/constants.js';
import { assignBitForGroup } from '../../core/group-manager.js';

export async function handleCreateGroup(requestData) {
    const { groupName } = requestData;
    if (!groupName || typeof groupName !== 'string' || groupName.trim() === '') {
        throw new Error('Invalid group name provided.');
    }

    const {
        [STRINGS.STORAGE_GROUPS]: currentGroups,
        [STRINGS.STORAGE_SUBSCRIPTIONS]: currentSubscriptions
    } = await storage.getItems([STRINGS.STORAGE_GROUPS, STRINGS.STORAGE_SUBSCRIPTIONS]);

    const { bit, updatedGroups, updatedSubscriptions } = await assignBitForGroup(groupName.trim(), currentGroups, currentSubscriptions);

    await storage.setItems({
        [STRINGS.STORAGE_GROUPS]: updatedGroups,
        [STRINGS.STORAGE_SUBSCRIPTIONS]: updatedSubscriptions
    });

    return { bit, groupName: groupName.trim() }; // Return data for the response
}

// export async function handleAddTabToGroup(requestData) { ... }
// export async function handleDeleteGroup(requestData) { ... }
// ... other group-related action handlers