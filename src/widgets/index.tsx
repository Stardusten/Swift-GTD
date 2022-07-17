import { declareIndexPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalAuthenticationProvider, msalConfig } from '../utils/auth';
import { Client } from '@microsoft/microsoft-graph-client';
import { toggleTaskCancelled, toggleTaskDone, toggleTaskLater, toggleTaskNow, toggleToTask } from '../utils/gtd';
import { firstSync, normalSync } from '../utils/sync';

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
  });

  await plugin.app.registerPowerup(
    'Task',
    'taskPowerup',
    'Tag all your tasks with this powerup.',
    {
      slots: [
        // DONE NOW LATER CANCELLED
        { code: 'status', name: 'Status' },
        { code: 'dateDue', name: 'Date Due'},
        { code: 'priority', name: 'Priority'},
        { code: 'createTime', name: 'Create Time' },
        { code: 'startTime', name: 'Start Time' },
        { code: 'finishTime', name: 'Finish Time' },
        { code: 'cancelledTime', name: 'Cancelled Time' },
        { code: 'duration', name: 'Duration' },
        { code: 'totalTime', name: 'Total Time' },
        { code: 'timeLog', name: 'Time Log' }
      ],
    }
  );

  for (const statusName of ['Done', 'Now', 'Later', 'Cancelled']) {
    await plugin.app.registerPowerup(
      statusName,
      `status${statusName}`,
      `Task Status ${statusName}`,
      { slots: [] }
    );
  }

  await plugin.app.registerCommand({
    id: 'toggleTask',
    name: 'Toggle Task',
    description: 'Convert focused rem to a task (tag with Task powerup and add all slots).',
    quickCode: 'tt',
    action: async () => { await toggleToTask(plugin); }
  });

  await plugin.app.registerCommand({
    id: 'toggleTaskDone',
    name: 'Toggle Task Done',
    description: '', // TODO
    quickCode: 'ttd',
    action: async () => { await toggleTaskDone(plugin); }
  });

  await plugin.app.registerCommand({
    id: 'toggleTaskNow',
    name: 'Toggle Task Now',
    description: '', // TODO
    quickCode: 'ttn',
    action: async () => { await toggleTaskNow(plugin); }
  });

  await plugin.app.registerCommand({
    id: 'toggleTaskLater',
    name: 'Toggle Task Later',
    description: '', // TODO
    quickCode: 'ttl',
    action: async () => { await toggleTaskLater(plugin); }
  });

  await plugin.app.registerCommand({
    id: 'toggleTaskCancelled',
    name: 'Toggle Task Cancelled',
    description: '', // TODO
    quickCode: 'ttc',
    action: async () => { await toggleTaskCancelled(plugin); }
  });

  /**
   * Since Microsoft Graph doesn't provide API to move a task to My Day,
   * we decide to map Now tasks to important tasks in Microsoft TO DO.
   *
   * Done Tasks  <==> Finished Tasks
   * Now Tasks   <==> Important Unfinished Tasks
   * Later Tasks <==> Normal Unfinished Tasks
   */
  await plugin.app.registerCommand({
    id: 'syncAllTasks',
    name: 'Sync All Tasks to Microsoft TODO',
    description: '', // TODO
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
          await normalSync(graphClient, taskList, plugin);
        }
      }
    }
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
