import { processIncomingTasks } from '../task-processor.js';

export async function handleProcessIncomingTasks(requestData) {
    const { tasks } = requestData;
    if (!tasks) {
        throw new Error('No tasks provided for processing.');
    }
    await processIncomingTasks(tasks);
    return { message: "Tasks processed" }; // Or any relevant result
}

// ... other task-related action handlers