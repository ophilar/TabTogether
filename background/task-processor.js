import { storage } from '../core/storage.js';
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';
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
    const openedTabsDetails = [];

    for (const groupName in allGroupTasksFromStorage) {
        if (!localSubscriptions.includes(groupName)) {
            continue;
        }

        const tasksInGroup = allGroupTasksFromStorage[groupName];
        for (const taskId in tasksInGroup) {
            const taskData = tasksInGroup[taskId];

            if (!taskData || taskData.senderDeviceId === localInstanceId || localProcessedTasks[taskId]) {
                continue;
            }

            try {
                console.log(`TaskProcessor: Opening tab for task ${taskId} from group ${groupName}: ${taskData.url}`);
                await browser.tabs.create({ url: taskData.url, active: false });

                // Add this device to the task's processedByDeviceIds in the main storage object
                // This ensures allGroupTasksFromStorage reflects the change before a potential save.
                if (!allGroupTasksFromStorage[groupName][taskId].processedByDeviceIds) {
                    allGroupTasksFromStorage[groupName][taskId].processedByDeviceIds = [];
                }
                if (!allGroupTasksFromStorage[groupName][taskId].processedByDeviceIds.includes(localInstanceId)) {
                    allGroupTasksFromStorage[groupName][taskId].processedByDeviceIds.push(localInstanceId);
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
        await storage.set(browser.storage.sync, SYNC_STORAGE_KEYS.GROUP_TASKS, allGroupTasksFromStorage);
        console.log('TaskProcessor: Updated GROUP_TASKS in sync storage with new processedByDeviceIds.');
    }
    return openedTabsDetails;
}