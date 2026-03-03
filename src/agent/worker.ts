import { supabase, logTaskEvent } from './utils/logger';
import { Task } from '../lib/types';

const POLL_INTERVAL = 5000;

async function processTask(task: Task) {
    try {
        await logTaskEvent(task.id, 'info', `Starting task: ${task.type}`);

        // Update task status to running
        const { error: updateError } = await supabase
            .from('tasks')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('id', task.id);

        if (updateError) throw new Error(`Failed to update task status: ${updateError.message}`);

        // TODO: route task based on task.type
        switch (task.type) {
            case 'building_register':
                // await downloadBuildingRegister(task);
                console.log('Placeholder for building_register downloading');
                break;
            default:
                throw new Error(`Unsupported task type: ${task.type}`);
        }

        // Mark task as success
        await supabase
            .from('tasks')
            .update({ status: 'success', completed_at: new Date().toISOString() })
            .eq('id', task.id);

        await logTaskEvent(task.id, 'info', `Task completed naturally.`);

    } catch (error: any) {
        await logTaskEvent(task.id, 'error', `Task failed: ${error.message}`);

        // Mark task as failed
        await supabase
            .from('tasks')
            .update({
                status: 'failed',
                error_message: error.message,
                completed_at: new Date().toISOString()
            })
            .eq('id', task.id);
    }
}

async function pollTasks() {
    console.log('Polling for pending tasks...');

    // Find pending tasks
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

    if (error) {
        console.error('Error fetching tasks:', error);
    } else if (tasks && tasks.length > 0) {
        await processTask(tasks[0] as Task);
    }

    setTimeout(pollTasks, POLL_INTERVAL);
}

// Start worker
console.log('Starting Local Automation Agent Worker...');
pollTasks();
