import { RemId, RNPlugin } from '@remnote/plugin-sdk';
import { TodoTask, TodoTaskList } from '@microsoft/microsoft-graph-types';
import { Client } from '@microsoft/microsoft-graph-client';

export const firstSync = async (graphClient: Client, taskList: TodoTaskList ,plugin: RNPlugin) => {

  // obtain all task rems
  const taskPowerupRem = await plugin.powerup.getPowerupByCode('taskPowerup');
  const taskRems = await taskPowerupRem!.taggedRem();

  // a map, key: correspond Microsoft TO DO task's ID. value: local rem's ID.
  const taskId2remId = new Map();

  for (const taskRem of taskRems) {

    const title = await plugin.richText.toString(taskRem.text);

    let request;
    switch (await taskRem.getPowerupProperty('taskPowerup', 'status')) {

      case 'Done': {
        request = {
          title,
          status: 'completed',
        };
        break;
      }

      case 'Now': {
        request = {
          title,
          status: 'notStarted',
          importance: 'high',
        };
        break;
      }

      case 'Later': {
        request = {
          title,
          status: 'notStarted',
        };
        break;
      }

      // Cancelled tasks won't be synced.
      default:
        break;
    }

    if (request) {
      const responseTask: TodoTask = await graphClient.api(`/me/todo/lists/${taskList.id}/tasks`)
        .post(request);

      taskId2remId.set(responseTask.id, taskRem._id);
    }
  }

  // set taskId2remId
  await plugin.storage.setSynced('taskId2remId', taskId2remId);
}

export const normalSync = async (graphClient: Client, taskList: TodoTaskList ,plugin: RNPlugin) => {

  // obtain all task rems
  const taskPowerupRem = await plugin.powerup.getPowerupByCode('taskPowerup');
  const taskRems = await taskPowerupRem!.taggedRem();

  const taskId2remId: Map<string, RemId> = await plugin.storage.getSynced('taskId2remId');

  // TODO null check

  const response = await graphClient.api(`/me/todo/lists/${taskList.id}/tasks`)
    .get();

  for (const task of response.value) {

    // task is already in rn
    if (taskId2remId.has(task.id!)) {

    } else {
      // task is not in rn
      // create a task rem
      const newTaskRem = (await plugin.rem.createWithMarkdown(task.title!))!;
      await newTaskRem.addPowerup('taskPowerup');
      // fill createTime slot according to task's createDate field
      const createDate = new Date(task.createdDateTime!);
      await newTaskRem.setPowerupProperty('taskPowerup', 'createTime', [createDate.toUTCString()]);
      // add status tag
      switch (task.status) {
        case 'notStarted': {
          if (task.importance === 'high')
            await newTaskRem.setPowerupProperty('taskPowerup', 'status', ['Now']);
          else await newTaskRem.setPowerupProperty('taskPowerup', 'status', ['Later']);
          break;
        }
        case 'completed': {
          await newTaskRem.setPowerupProperty('taskPowerup', 'status', ['Done']);
          // fill finishTime slot according to task's completedDate field
          const completedDate = new Date(task.completedDateTime!.dateTime!);
          await newTaskRem.setPowerupProperty('taskPowerup', 'finishTime', [completedDate.toUTCString()]);
          break;
        }
        default:
          break;
      }

      // TODO add to daily document according to its createDate
      // const dailyDocument = await getDailyDocumentAt(createDate, plugin);

      // XXX just add to todays document
      const todaysDoc = (await plugin.date.getTodaysDoc())!;
      await plugin.rem.moveRems([newTaskRem._id], todaysDoc._id, 0);
    }
  }
}