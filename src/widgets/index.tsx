import {
  AppEvents,
  declareIndexPlugin,
  ReactRNPlugin,
  Rem,
  RNPlugin,
  usePlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import {
  genAsciiProgressBar, getPowerupProperty, getStatusName,
  isTaskRem,
  newTask, padStatusName, prevCheck, setStatus, toggleTaskStatus, updateRemTreeProgress,
} from '../utils/gtd';
import { getFocusedRem, successors } from '../utils/rem';

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
  });

  await plugin.app.registerWidget(
    'swift_gtd',
    WidgetLocation.RightSidebar,
    {
      dimensions: {
        height: 'auto',
        width: '350',
      },
      widgetTabIcon: 'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/120/microsoft/310/direct-hit_1f3af.png',
    },
  );

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

  await plugin.app.registerPowerup(
    'Automatically Done',
    'automaticallyDone',
    'If a task is tagged with this powerup, then when all of its subtasks are finished, it will toggle to "Done" status automatically.',
    { slots: [] }
  )

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
    action: async () => { await toggleTaskStatus(plugin, 'Scheduled') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToReady',
    name: 'Toggle To Ready',
    quickCode: 'tr',
    action: async () => { await toggleTaskStatus(plugin, 'Ready') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToNow',
    name: 'Toggle To Now',
    quickCode: 'tn',
    action: async () => { await toggleTaskStatus(plugin, 'Now') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToDone',
    name: 'Toggle To Done',
    quickCode: 'td',
    action: async () => { await toggleTaskStatus(plugin, 'Done') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToCancelled',
    name: 'Toggle To Cancelled',
    quickCode: 'tc',
    action: async () => { await toggleTaskStatus(plugin, 'Cancelled') }
  });

  await plugin.app.registerCommand({
    id: 'updateFocusedRemTreeProgress',
    name: 'Update Focused Rem Tree Progress',
    action: async () => {
      await prevCheck(
        plugin,
        updateRemTreeProgress
      );
    }
  });

  await plugin.app.registerCommand({
    id: 'startPomodoro',
    name: 'Start Pomodoro',
    action: async () => {
      await prevCheck(
        plugin,
        async (plugin: RNPlugin, focusedRem: Rem) => {
          await plugin.messaging.broadcast(`pomodoro:active:${focusedRem._id}`);
        })
    }
  });

  await plugin.event.addListener(
    AppEvents.MessageBroadcast,
    undefined,
    async ({ message }) => {

      const regMessage = /^task:(?<remId>.*?):(?<fromStatus>.*?):(?<toStatus>.*?)$/;
      const matchMessage = regMessage.exec(message);
      if (!matchMessage)
        return;

      const taskRemId = matchMessage.groups!.remId;
      const taskRem = (await plugin.rem.findOne(taskRemId))!;
      const fromStatus = matchMessage.groups!.fromStatus ? matchMessage.groups!.fromStatus : await getStatusName(taskRem);
      const toStatus = matchMessage.groups!.toStatus;

      // make sure there only one NOW task at the same time
      const nowTaskRemId = await plugin.storage.getSession('nowTaskRemId') as string;

      if (toStatus == 'Now') {
        if (nowTaskRemId) {
          await plugin.app.toast('Only one NOW task at the same time');
          return;
        } else {
          await plugin.storage.setSession('nowTaskRemId', taskRemId);
        }
      }

      if (fromStatus == 'Now' && toStatus != 'Now') {
        await plugin.storage.setSession('nowTaskRemId', undefined);
      }

      // set new status
      await setStatus(taskRem, toStatus, plugin);

      // add log
      let timeLog = await taskRem.getPowerupProperty('taskPowerup', 'timeLog');
      timeLog += `\n[${new Date().toLocaleString()}]   ${padStatusName(fromStatus)}   →   ${padStatusName(toStatus)}`;
      await taskRem.setPowerupProperty('taskPowerup', 'timeLog', [timeLog]);

      // update proress bar
      for await (const rem of successors(taskRem)) {
        if (await isTaskRem(rem)) {
          const progress = await rem.getPowerupProperty('taskPowerup', 'progress');
          const progressBarSymbol = await plugin.settings.getSetting('progressBarSymbol') as string;
          if (!progress) { // no progress bar, regenerate one
            await updateRemTreeProgress(plugin, rem);
          } else {
            // extract the progress from property
            const reg = /[★☆]*   \[(\d*)\/(\d*)]/;
            const resultArr = reg.exec(progress);
            if (resultArr) {
              let finishedNum;
              let totalNum;
              if (toStatus == 'Done' && fromStatus != 'Cancelled') {
                finishedNum = parseInt(resultArr[1]) + 1;
                totalNum = parseInt(resultArr[2]);
              } else if (toStatus == 'Done' && fromStatus == 'Cancelled') {
                finishedNum = parseInt(resultArr[1]) + 1;
                totalNum = parseInt(resultArr[2]) + 1;
              } else if (toStatus == 'Cancelled' && fromStatus != 'Done') {
                finishedNum = parseInt(resultArr[1]);
                totalNum = parseInt(resultArr[2]) - 1;
              } else if (toStatus == 'Cancelled' && fromStatus == 'Done') {
                finishedNum = parseInt(resultArr[1]) - 1;
                totalNum = parseInt(resultArr[2]) - 1;
              } else if (toStatus != 'Cancelled' && fromStatus == 'Done') {
                finishedNum = parseInt(resultArr[1]) - 1;
                totalNum = parseInt(resultArr[2]);
              } else if (toStatus != 'Cancelled' && fromStatus == 'Cancelled') {
                finishedNum = parseInt(resultArr[1]);
                totalNum = parseInt(resultArr[2]) + 1;
              } else {
                finishedNum = parseInt(resultArr[1]);
                totalNum = parseInt(resultArr[2]);
              }
              // zero check
              if (totalNum == 0) {
                const progressPropertyRem = await getPowerupProperty(rem, 'Progress', plugin);
                progressPropertyRem?.remove();
              }
              // update
              const newProgress = genAsciiProgressBar(finishedNum / totalNum, progressBarSymbol) + `   [${finishedNum}/${totalNum}]`;
              await rem.setPowerupProperty('taskPowerup', 'progress', [newProgress]);
              // if all subtask finished
              if (await rem.hasPowerup('automaticallyDone') && finishedNum == totalNum) {
                await plugin.messaging.broadcast(`task:${rem._id}::Done`);
              }
            } else {
              await plugin.app.toast('ERROR | Invalid progress property.' + resultArr);
            }
          }
          // only consider direct parent task
          break;
        }
      }
    }
  );

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

  await plugin.app.registerCommand({
    id: 'check synced storage',
    name: 'check synced storage',
    action: async () => {
      console.log(await plugin.storage.getSynced('unfinishedPomodoro'));
    }
  })
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
