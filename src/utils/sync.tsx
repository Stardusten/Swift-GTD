import { Rem, RemId, RNPlugin } from '@remnote/plugin-sdk';
import { TaskStatus, TodoTask, TodoTaskList } from '@microsoft/microsoft-graph-types';
import { Client } from '@microsoft/microsoft-graph-client';
import { addTimeLog, getStatusName, padStatusName, setStatus } from './gtd';

export const normalSync = async (graphClient: Client, taskList: TodoTaskList ,plugin: RNPlugin) => {

  // get task rems in RemNote
  const taskPowerupRem = await plugin.powerup.getPowerupByCode('taskPowerup');
  const rnOnlyTaskRemIds = new Set(
    (await taskPowerupRem!.taggedRem()).map(rem => rem._id));

  // get a map that record all the synced task rems
  const taskId2remId: Map<string, RemId> = await plugin.storage.getSynced('taskId2remId') || new Map();

  // TODO null check

  // get tasks in Microsoft TO DO
  const response = await graphClient.api(`/me/todo/lists/${taskList.id}/tasks`)
    .get();
  const microsoftTodoTasks: TodoTask[] = response.value;

  for (const task of microsoftTodoTasks) {
    // this task is already in RemNote
    if (taskId2remId.has(task.id!)) {
      const taskRemId = taskId2remId.get(task.id!);
      const taskRem = await plugin.rem.findOne(taskRemId);
      if (taskRem) {
        // update rnOnlyTasks
        rnOnlyTaskRemIds.delete(taskRem._id);
        if (await isConsistent(taskRem, task, plugin)) {
          // task in RemNote and Microsoft TO DO are consistent
          // no need to sync!
        } else {
          // determine which side to choose according to last modified time
          const rnLastUpdateTime = new Date(taskRem.u);
          const msUpdateTime = new Date(task.lastModifiedDateTime!);
          // get now status
          const nowRnStatus = await getStatusName(taskRem);
          // TODO handle conflict
          if (rnLastUpdateTime < msUpdateTime) {
            // update task in Remnote

            // TODO update title

            // set new status
            const newRnStatus = msStatus2rnStatus(task.status!, task.importance!);
            await setStatus(taskRem, newRnStatus, plugin);

            // add log
            const newTimeLog = `[${new Date().toLocaleString()}]   ${padStatusName(nowRnStatus)}   →   ${padStatusName(newRnStatus)}`;
            await addTimeLog([newTimeLog], taskRem, plugin);
          } else {
            // update task in Microsoft TO DO
            const updateRequest = {
              status: nowRnStatus == 'Done' ? 'complete' : 'notStarted',
              importance: nowRnStatus == 'Now' || nowRnStatus == 'Ready' ? 'high' : 'normal',
              title: taskRem.text,
            }
            await graphClient.api(`/me/todo/lists/${taskList.id}/tasks/${task.id}`)
              .update(updateRequest);
          }
        }
      } else {
        // TODO task rem is deleted! Ask the user whether to delete corresponding task in Microsoft TODO.
      }
    } else {
      // task is not in rn
      // create a task rem
      const newTaskRem = (await plugin.rem.createWithMarkdown(task.title!))!;
      await newTaskRem.addPowerup('taskPowerup');

      // set new status
      const status = msStatus2rnStatus(task.status!, task.importance!);
      await setStatus(newTaskRem, status, plugin);

      // add log
      const newTimeLog = `[${new Date(task.lastModifiedDateTime!).toLocaleString()}]   ${padStatusName(status)}`;
      await addTimeLog([newTimeLog], newTaskRem, plugin);

      // TODO add to daily document according to its createDate
      // const dailyDocument = await getDailyDocumentAt(createDate, plugin);

      // XXX just add to todays document
      const todaysDoc = (await plugin.date.getTodaysDoc())!;
      await plugin.rem.moveRems([newTaskRem._id], todaysDoc._id, 0);

      // update taskId2remId
      taskId2remId.set(task.id!, newTaskRem._id);
    }
  }

  // for tasks in rn but not in Microsoft TO DO
  // sync to Microsoft TO DO directly.
  for (const remId of rnOnlyTaskRemIds) {
    const taskRem = (await plugin.rem.findOne(remId))!;
    const taskStatus = await getStatusName(taskRem);
    const createRequest = {
      title: taskRem.text,
      status: taskStatus == 'Done' ? 'completed' : 'notStarted',
      importance: taskStatus == 'Now' || taskStatus == 'Ready' ? 'high' : 'normal',
    };

    await graphClient.api(`/me/todo/lists/${taskList.id}/tasks`)
      .post(createRequest);
  }
}

const isSameStatus = (rnTaskStatus: string, msTaskStatus: TaskStatus, msTaskImportance: string) => {
  switch (rnTaskStatus) {
    case 'Done':
      return msTaskStatus == 'completed';
    case 'Now':
    case 'Ready':
      return msTaskStatus == 'notStarted' && msTaskImportance == 'high';
    case 'Scheduled':
      return msTaskStatus == 'notStarted' && msTaskImportance != 'high';
    case 'Cancelled':
      throw Error('cancelled task is not synced.');
  }
}

const msStatus2rnStatus = (msStatus: string, msImportance: string) => {
  switch (msStatus) {
    case 'completed':
      return 'Done';
    case 'notStarted':
      return msImportance == 'high' ? 'Ready' : 'Scheduled';
    default:
      throw Error('Illegal argument');
  }
}

/**
 * `rnTask` and `msTask` are consistent if they have the same status and title.
 */
const isConsistent = async (rnTask: Rem, msTask: TodoTask, plugin: RNPlugin) => {
  const rnTaskStatus = await getStatusName(rnTask);
  if (isSameStatus(rnTaskStatus, msTask.status!, msTask.importance!)) {
    const rnTaskTitle = await plugin.richText.toString(rnTask.text);
    const msTaskTitle = msTask.title!;
    return rnTaskTitle.trim() == msTaskTitle.trim();
  }
  return false;
}