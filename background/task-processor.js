import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS, SYNC_STORAGE_KEYS } from '../common/constants.js';

export async function processIncomingTasks(allGroupTasksFromStorage) {
    console.log('TaskProcessor:processIncomingTasks - Processing incoming tasks from storage change...');
    if (!allGroupTasksFromStorage || typeof allGroupTasksFromStorage !== 'object' || Object.keys(allGroupTasksFromStorage).length === 0) {
        console.log('TaskProcessor:processIncomingTasks - No group tasks found in storage or tasks object is empty.');
        return [];
    }

    const localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    let localProcessedTasks = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});
    let newTasksProcessedThisRun = false;
    let groupTasksModifiedInSync = false;
    let taskUpdatesForSync = {}; // Collect updates for a single mergeItem call
    const openedTabsDetails = [];

    for (const groupName in allGroupTasksFromStorage) {
        console.log(`TaskProcessor:processIncomingTasks - Checking group: "${groupName}"`); // Can be verbose
        if (!localSubscriptions.includes(groupName)) {
            continue;
        }

        const tasksInGroup = allGroupTasksFromStorage[groupName];
        for (const taskId in tasksInGroup) {
            const taskData = tasksInGroup[taskId];
            console.log(`TaskProcessor:processIncomingTasks - Considering task "${taskId}" in group "${groupName}"`); // Can be verbose

            if (!taskData ||
                localProcessedTasks[taskId]) {
                continue;
            } else {
                console.log(`TaskProcessor:processIncomingTasks - Task "${taskId}" is new for this device.`);
            }

            try {
                console.log(`TaskProcessor:processIncomingTasks - Opening tab for task ${taskId} from group ${groupName}: ${taskData.url}`);
                await browser.tabs.create({ url: taskData.url, active: false });

                // Prepare update for this specific task
                const currentProcessedBy = allGroupTasksFromStorage[groupName][taskId].processedByDeviceIds || [];
                if (!currentProcessedBy.includes(localInstanceId)) {
                    
                    // Deeply ensure path exists in taskUpdatesForSync
                    if (!taskUpdatesForSync[groupName]) {
                        taskUpdatesForSync[groupName] = {};
                    }
                    if (!taskUpdatesForSync[groupName][taskId]) {
                        taskUpdatesForSync[groupName][taskId] = {};
                    }
                    groupTasksModifiedInSync = true;
                }


                localProcessedTasks[taskId] = Date.now();
                openedTabsDetails.push({ title: taskData.title, url: taskData.url, groupName: groupName });
                newTasksProcessedThisRun = true;
            } catch (error) {
                console.error(`TaskProcessor:processIncomingTasks - Failed to open tab for task ${taskId} (${taskData.url}):`, error);
            }
        }
    }
    if (newTasksProcessedThisRun) {
        await storage.set(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, localProcessedTasks);
        console.log('TaskProcessor:processIncomingTasks - Updated local processed tasks list.');
    } else {
        console.log('TaskProcessor:processIncomingTasks - No new tasks were processed in this run.');
    }
    if (groupTasksModifiedInSync) {
        const mergeResult = await storage.mergeItem(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, taskUpdatesForSync);
        if(mergeResult.success) console.log('TaskProcessor:processIncomingTasks - Merged processedByDeviceIds updates into GROUP_TASKS in sync storage.');
        else console.error('TaskProcessor:processIncomingTasks - FAILED to merge processedByDeviceIds updates into GROUP_TASKS.');
    }
    console.log('TaskProcessor:processIncomingTasks - Finished processing. Opened tabs:', openedTabsDetails.length);
    return openedTabsDetails;
}