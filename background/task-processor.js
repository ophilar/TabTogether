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

            if (taskData.recipientDeviceIds && Array.isArray(taskData.recipientDeviceIds) && taskData.recipientDeviceIds.length > 0) {
                if (!taskData.recipientDeviceIds.includes(localInstanceId)) {
                    continue;
                }
            }

            try {
                console.log(`TaskProcessor: Opening tab for task ${taskId} from group ${groupName}: ${taskData.url}`);
                await browser.tabs.create({ url: taskData.url, active: false });
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
    return openedTabsDetails;
}