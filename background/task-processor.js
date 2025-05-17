import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS, SYNC_STORAGE_KEYS } from '../common/constants.js';
import { getInstanceId } from '../core/instance.js';

export async function processIncomingTasks(allGroupTasksFromStorage) {
    console.log('TaskProcessor: Processing incoming tasks from storage change...');
    if (!allGroupTasksFromStorage || typeof allGroupTasksFromStorage !== 'object' || Object.keys(allGroupTasksFromStorage).length === 0) {
        console.log('TaskProcessor: No group tasks found in storage or tasks object is empty.');
        return [];
    }

    const localInstanceId = await getInstanceId();
    const localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    let localProcessedTasks = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});
    let newTasksProcessedThisRun = false;
    let groupTasksModifiedInSync = false;
    let taskUpdatesForSync = {}; // Collect updates for a single mergeItem call
    const openedTabsDetails = [];

    for (const groupName in allGroupTasksFromStorage) {
        if (!localSubscriptions.includes(groupName)) {
            continue;
        }

        const tasksInGroup = allGroupTasksFromStorage[groupName];
        for (const taskId in tasksInGroup) {
            const taskData = tasksInGroup[taskId];

            // Skip if no task data, or if this device is already in processedByDeviceIds (creator or already processed)
            // Also skip if it's in the localProcessedTasks cache
            if (!taskData ||
                (taskData.processedByDeviceIds && taskData.processedByDeviceIds.includes(localInstanceId)) ||
                localProcessedTasks[taskId]) {
                continue;
            }

            try {
                console.log(`TaskProcessor: Opening tab for task ${taskId} from group ${groupName}: ${taskData.url}`);
                await browser.tabs.create({ url: taskData.url, active: false });

                // Prepare update for this specific task
                const currentProcessedBy = allGroupTasksFromStorage[groupName][taskId].processedByDeviceIds || [];
                if (!currentProcessedBy.includes(localInstanceId)) {
                    const updatedProcessedBy = [...currentProcessedBy, localInstanceId];
                    
                    // Deeply ensure path exists in taskUpdatesForSync
                    if (!taskUpdatesForSync[groupName]) {
                        taskUpdatesForSync[groupName] = {};
                    }
                    if (!taskUpdatesForSync[groupName][taskId]) {
                        taskUpdatesForSync[groupName][taskId] = {};
                    }
                    taskUpdatesForSync[groupName][taskId].processedByDeviceIds = updatedProcessedBy;
                    groupTasksModifiedInSync = true;
                }


                localProcessedTasks[taskId] = Date.now();
                openedTabsDetails.push({ title: taskData.title, url: taskData.url, groupName: groupName });
                newTasksProcessedThisRun = true;
            } catch (error) {
                console.error(`TaskProcessor: Failed to open tab for task ${taskId} (${taskData.url}):`, error);
            }
        }
    }
    if (newTasksProcessedThisRun) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
        console.log('TaskProcessor: Updated local processed tasks list.');
    } else {
        console.log('TaskProcessor: No new tasks were processed in this run.');
    }
    if (groupTasksModifiedInSync) {
        const mergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, taskUpdatesForSync);
        if(mergeResult.success) console.log('TaskProcessor: Merged processedByDeviceIds updates into GROUP_TASKS in sync storage.');
        else console.error('TaskProcessor: FAILED to merge processedByDeviceIds updates into GROUP_TASKS.');
    }
    return openedTabsDetails;
}