import { declareIndexPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalAuthenticationProvider, msalConfig } from '../utils/auth';
import { Client } from '@microsoft/microsoft-graph-client';

async function onActivate(plugin: ReactRNPlugin) {

  await plugin.settings.registerStringSetting({
    id: 'clientID',
    title: 'Application (client) ID',
    defaultValue: '',
  });

  await plugin.settings.registerStringSetting({
    id: 'syncTaskListName',
    title: 'Name of taskList that will be synced sync in Microsoft TODO.',
    defaultValue: 'RN Sync',
  })

  await plugin.app.registerPowerup(
    'Task',
    'taskPowerup',
    'Tag all your tasks with this powerup.',
    {
      slots: [
        // DONE NOW LATER CANCELLED
        { code: 'dateDue', name: 'Date Due'},
        { code: 'priority', name: 'Priority'},
        { code: 'createTime', name: 'Create Time' },
        { code: 'startTime', name: 'Start Time' },
        { code: 'finishTime', name: 'Finish Time' },
        { code: 'cancelledTime', name: 'Cancelled Time'},
      ],
    }
  );

  await plugin.app.registerCommand({
    id: 'gtdTemplate',
    name: 'Apply GTD Template',
    description: 'Create "Tasks" document and four sub document named "Done", "Later", "Now", "Cancelled" under it.',
    action: async () => {
      for (const remName of ['Done', 'Later', 'Now', 'Cancelled']) {
        // create subRem if not exists
        let subRem = await plugin.rem.findByName([remName], null);
        subRem = subRem || await plugin.rem.createWithMarkdown(remName);

        // set as document
        await subRem!.setIsDocument(true);
      }
    }
  })

  await plugin.app.registerCommand({
    id: 'toggleTask',
    name: 'Toggle Task',
    description: 'Convert focused rem to a task (tag with Task powerup and add all slots).',
    quickCode: 'tt',
    action: async () => {
      const focusedRemId = await plugin.focus.getFocusedRemId();
      const focusedRem = await plugin.rem.findOne(focusedRemId);
      if (focusedRem) {

        if (await focusedRem.hasPowerup('taskPowerup')) {
          // already tagged with Task powerup
          // TODO untag? or donothing?
        } else {
          // add Task powerup to focused
          await focusedRem.addPowerup('taskPowerup');

          // record createTime
          const createTime = [new Date().toTimeString()];
          await focusedRem.setPowerupProperty('taskPowerup', 'createTime', createTime);

          // initial state: Later
          // move to Later page if such page exists
          const moveTarget = await plugin.rem.findByName(['Later'], null);
          if (moveTarget) {
            await plugin.rem.moveRems([focusedRemId], moveTarget._id, 0);
          } else {
            await plugin.app.toast('Cannot determine where to move.');
          }
        }

      } else {
        await plugin.app.toast('You are not focus at any rem.');
      }
    }
  });

  await plugin.app.registerCommand({
    id: 'taskDone',
    name: 'Task Done',
    description: 'Move this task under Done rem, and record Finish Time.',
    quickCode: 'td',
    action: async () => {
      const focusedRemId = await plugin.focus.getFocusedRemId();
      const focusedRem = await plugin.rem.findOne(focusedRemId);
      if (focusedRem) {
        if (await focusedRem.hasPowerup('taskPowerup')) {

          // TODO link to daily page
          // record finish time
          const finishTime = [new Date().toTimeString()];
          await focusedRem.setPowerupProperty('taskPowerup', 'finishTime', finishTime);

          // move to Done page if such page exists
          const moveTarget = await plugin.rem.findByName(['Done'], null);
          if (moveTarget) {
            await plugin.rem.moveRems([focusedRemId], moveTarget._id, -1);
          } else {
            await plugin.app.toast('Cannot determine where to move.');
          }
        } else {
          await plugin.app.toast('You can only set a task (rem tagged with Task powerup) done.');
        }
      } else {
        await plugin.app.toast('You are not focus at any rem.');
      }
    }
  });

  await plugin.app.registerCommand({
    id: 'taskNow',
    name: 'Task Now',
    description: 'Move this task under Now rem, and record Start Time.',
    quickCode: 'tn',
    action: async () => {
      const focusedRemId = await plugin.focus.getFocusedRemId();
      const focusedRem = await plugin.rem.findOne(focusedRemId);
      if (focusedRem) {
        if (await focusedRem.hasPowerup('taskPowerup')) {

          // TODO link to daily page
          // record start time
          const startTime = [new Date().toTimeString()];
          await focusedRem.setPowerupProperty('taskPowerup', 'startTime', startTime);

          // move to Now page if such page exists
          const moveTarget = await plugin.rem.findByName(['Now'], null);
          if (moveTarget) {
            await plugin.rem.moveRems([focusedRemId], moveTarget._id, -1);
          } else {
            await plugin.app.toast('Cannot determine where to move.');
          }
        } else {
          await plugin.app.toast('You can only set a task (rem tagged with Task powerup) done.');
        }
      } else {
        await plugin.app.toast('You are not focus at any rem.');
      }
    }
  });

  await plugin.app.registerCommand({
    id: 'taskCancelled',
    name: 'Task Cancelled',
    description: 'Move this task under Cancelled rem, and record Cancelled Time.',
    quickCode: 'tc',
    action: async () => {
      const focusedRemId = await plugin.focus.getFocusedRemId();
      const focusedRem = await plugin.rem.findOne(focusedRemId);
      if (focusedRem) {
        if (await focusedRem.hasPowerup('taskPowerup')) {

          // TODO link to daily page
          // record cancelled time
          const cancelledTime = [new Date().toTimeString()];
          await focusedRem.setPowerupProperty('taskPowerup', 'cancelled', cancelledTime);

          // move to Cancelled page if such page exists
          const moveTarget = await plugin.rem.findByName(['Cancelled'], null);
          if (moveTarget) {
            await plugin.rem.moveRems([focusedRemId], moveTarget._id, -1);
          } else {
            await plugin.app.toast('Cannot determine where to move.');
          }
        } else {
          await plugin.app.toast('You can only set a task (rem tagged with Task powerup) done.');
        }
      } else {
        await plugin.app.toast('You are not focus at any rem.');
      }
    }
  });

  await plugin.app.registerCommand({
    id: 'syncAllTasks',
    name: 'Sync All Tasks to Microsoft TODO',
    quickCode: 'sat',
    action: async () => {

      const clientId = await plugin.settings.getSetting('clientID') as string;

      if (clientId == '') {
        await plugin.app.toast('Please specify clientID in plugin setting first!');
        return;
      }

      msalConfig.auth.clientId = clientId;
      const msal = new PublicClientApplication(msalConfig);

      const authProvider = new MsalAuthenticationProvider({
        scopes: ["Tasks.ReadWrite"] // TODO
      }, msal);

      const graphClient = Client.initWithMiddleware({ authProvider });

      // name of taskList that will be synced sync in Microsoft TODO
      const syncTaskListName = await plugin.settings.getSetting('syncTaskListName');

      // fetch all the task lists
      const taskLists = await graphClient.api('/me/todo/lists').get();
      for (const taskList of taskLists.value) {
        // find taskList to be synced
        if (taskList.displayName === syncTaskListName) {
          const tasks = await graphClient.api(`/me/todo/lists/${taskList.id}/tasks`).get();

          const taskId2RemId = await plugin.storage.getSynced('taskId2RemId');
          for (const task of tasks.value) {
            // try to get rem correspond to task
            const remId = taskId2RemId.get(task.id);
            // exists such rem
            if (remId) {
              const rem = await plugin.rem.findOne(remId); // TODO not exist handling

            }
          }
        }
      }
    }
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
