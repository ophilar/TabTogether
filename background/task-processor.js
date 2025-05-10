// background/task-processor.js

import { storage } from '../core/storage.js'; // Corrected import path
import { LOCAL_STORAGE_KEYS } from '../common/constants.js';
import { getInstanceId } from '../core/instance.js'; // To identify self

/**
 * Processes incoming tasks from sync storage for the current device.
 * Opens tabs for relevant tasks and marks them as processed locally.
 *
 * @param {object} allGroupTasksFromStorage - The complete GROUP_TASKS object from sync storage.
 *                                         Format: { groupName: { taskId: taskData, ... }, ... }
 */
export async function processIncomingTasks(allGroupTasksFromStorage) {
    console.log('TaskProcessor: Processing incoming tasks from storage change...');
    if (!allGroupTasksFromStorage || typeof allGroupTasksFromStorage !== 'object' || Object.keys(allGroupTasksFromStorage).length === 0) {
        console.log('TaskProcessor: No group tasks found in storage or tasks object is empty.');
        return;
    }

    const localInstanceId = await getInstanceId();
    const localSubscriptions = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.SUBSCRIPTIONS, []);
    let localProcessedTasks = await storage.get(browser.storage.local, LOCAL_STORAGE_KEYS.PROCESSED_TASKS, {});
    let newTasksProcessedThisRun = false;

    for (const groupName in allGroupTasksFromStorage) {
        if (!localSubscriptions.includes(groupName)) {
            continue; // Not subscribed to this group
        }

        const tasksInGroup = allGroupTasksFromStorage[groupName];
        for (const taskId in tasksInGroup) {
            const taskData = tasksInGroup[taskId];

            if (!taskData || taskData.senderDeviceId === localInstanceId || localProcessedTasks[taskId]) {
                continue; // Invalid task, sent by self, or already processed
            }

            // Check recipientDeviceIds if present
            if (taskData.recipientDeviceIds && Array.isArray(taskData.recipientDeviceIds) && taskData.recipientDeviceIds.length > 0) {
                if (!taskData.recipientDeviceIds.includes(localInstanceId)) {
                    continue; // Task has specific recipients, and this device is not one of them
                }
            }
            // If no recipientDeviceIds, task is for all subscribed (handled by group subscription check)

            try {
                console.log(`TaskProcessor: Opening tab for task ${taskId} from group ${groupName}: ${taskData.url}`);
                await browser.tabs.create({ url: taskData.url, active: false });
                localProcessedTasks[taskId] = Date.now(); // Mark as processed with timestamp
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
}