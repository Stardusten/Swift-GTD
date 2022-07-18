import { declareIndexPlugin, ReactRNPlugin } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import {
  newTask,
  genAsciiProgressBar,
  isTaskRem,
  prevCheck,
  toggleToStatus,
} from '../utils/gtd';
import { MsalAuthenticationProvider, msalConfig } from '../utils/auth';
import { PublicClientApplication } from '@azure/msal-browser';
import { normalSync } from '../utils/sync';
import { Client } from '@microsoft/microsoft-graph-client';
import { successors } from '../utils/rem';

async function onActivate(plugin: ReactRNPlugin) {

  await plugin.settings.registerStringSetting({
    id: 'clientID',
    title: 'Application (client) ID',
    defaultValue: '',
  });

  await plugin.settings.registerStringSetting({
    id: 'syncTaskListName',
    title: 'Sync Task List Name',
    defaultValue: 'RN Sync',
  });

  await plugin.settings.registerStringSetting({
    id: 'progressBarSymbol',
    title: 'Progress Bar Symbol',
    defaultValue: '●○'
  })

  await plugin.app.registerPowerup(
    'Task',
    'taskPowerup',
    'Tag all your tasks with this powerup.',
    {
      slots: [
        { code: 'status', name: 'Status' },
        { code: 'dateDue', name: 'Date Due'},
        { code: 'priority', name: 'Priority'},
        { code: 'timeLog', name: 'timeLog' },
        { code: 'progress', name: 'Progress' }
      ],
    }
  );

  for (const statusName of ['Done', 'Now', 'Ready', 'Scheduled', 'Cancelled']) {
    await plugin.app.registerPowerup(
      statusName,
      `status${statusName}`,
      `Task Status ${statusName}`,
      { slots: [] }
    );
  }

  await plugin.app.registerCommand({
    id: 'NewTask',
    name: 'New Task',
    quickCode: 'nt',
    action: async () => { await newTask(plugin) }
  });

  await plugin.app.registerCommand({
    id: 'toggleToScheduled',
    name: 'Toggle To Scheduled',
    quickCode: 'ts',
    action: async () => { await toggleToStatus(plugin, 'Scheduled') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToReady',
    name: 'Toggle To Ready',
    quickCode: 'tr',
    action: async () => { await toggleToStatus(plugin, 'Ready') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToNow',
    name: 'Toggle To Now',
    quickCode: 'tn',
    action: async () => { await toggleToStatus(plugin, 'Now') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToDone',
    name: 'Toggle To Done',
    quickCode: 'td',
    action: async () => { await toggleToStatus(plugin, 'Done') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToCancelled',
    name: 'Toggle To Cancelled',
    quickCode: 'tc',
    action: async () => { await toggleToStatus(plugin, 'Cancelled') }
  });

  await plugin.app.registerCommand({
    id: 'totalTime',
    name: 'Total Time',
    action: async () => {

    }
  })


  /**
   * Since Microsoft Graph doesn't provide API to move a task to My Day,
   * we decide to map Now tasks to important tasks in Microsoft TO DO.
   *
   * Done Tasks         <==> Finished Tasks
   * Now / Ready Tasks  <==> Important Unfinished Tasks
   * Scheduled Tasks    <==> Normal Unfinished Tasks
   * Cancelled Tasks    =x=  (won't be synced)
   */
  // await plugin.app.registerCommand({
  //   id: 'syncAllTasks',
  //   name: 'Sync All Tasks to Microsoft TODO',
  //   description: '', // TODO
  //   action: async () => {
  //
  //     const clientId = await plugin.settings.getSetting('clientID') as string;
  //
  //     if (clientId == '') {
  //       await plugin.app.toast('Please specify clientID in plugin setting first!');
  //       return;
  //     }
  //
  //     msalConfig.auth.clientId = clientId;
  //     const msal = new PublicClientApplication(msalConfig);
  //
  //     const authProvider = new MsalAuthenticationProvider({
  //       scopes: ["Tasks.ReadWrite"] // TODO
  //     }, msal);
  //
  //     const graphClient = Client.initWithMiddleware({ authProvider });
  //
  //     // name of taskList that will be synced sync in Microsoft TODO
  //     const syncTaskListName = await plugin.settings.getSetting('syncTaskListName');
  //
  //     // fetch all the task lists
  //     const taskLists = await graphClient.api('/me/todo/lists').get();
  //     for (const taskList of taskLists.value) {
  //       // find taskList to be synced
  //       if (taskList.displayName === syncTaskListName) {
  //         await normalSync(graphClient, taskList, plugin);
  //       }
  //     }
  //   }
  // });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
