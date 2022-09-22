import { AppEvents, declareIndexPlugin, ReactRNPlugin, Rem, RNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import {
  addTimeLog,
  genAsciiProgressBar,
  getPowerupProperty,
  getStatusName,
  isTaskRem,
  newTask,
  prevCheck,
  setStatus,
  toggleFocusedTaskStatus,
  updateRemTreeProgress,
} from '../utils/gtd';
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
  });

  await plugin.settings.registerStringSetting({
    id: 'defaultPomodoroTime',
    title: 'Default Pomodoro Time',
    defaultValue: '30min',
  })

  await plugin.app.registerWidget(
    'sidebar',
    WidgetLocation.RightSidebar,
    {
      dimensions: {
        height: 'auto',
        width: '350',
      },
      widgetTabIcon: 'https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/120/microsoft/310/direct-hit_1f3af.png',
    },
  );

  await plugin.app.registerWidget(
    'task_peeker',
    WidgetLocation.RightSideOfEditor,
    {
      dimensions: {
        height: 'auto',
        width: 'auto',
      },
    }
  );

  await plugin.app.registerWidget(
    'popup_task_pane',
    WidgetLocation.FloatingWidget,
    {
      dimensions: {
        height: 'auto',
        width: 400
      }
    }
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
        { code: 'progress', name: 'Progress' }
      ],
    }
  );

  await plugin.app.registerPowerup(
    'Automatically Done',
    'automaticallyDone',
    'If a task is tagged with this powerup, then when all of its subtasks are finished, it will toggle to "Done" status automatically.',
    { slots: [] }
  );

  await plugin.app.registerPowerup(
    'Time Log',
    'timeLog',
    'All the time logs',
    { slots: [] }
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
    action: async () => { await toggleFocusedTaskStatus(plugin, 'Scheduled') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToReady',
    name: 'Toggle To Ready',
    quickCode: 'tr',
    action: async () => { await toggleFocusedTaskStatus(plugin, 'Ready') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToNow',
    name: 'Toggle To Now',
    quickCode: 'tn',
    action: async () => { await toggleFocusedTaskStatus(plugin, 'Now') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToDone',
    name: 'Toggle To Done',
    quickCode: 'td',
    action: async () => { await toggleFocusedTaskStatus(plugin, 'Done') }
  });

  await plugin.app.registerCommand({
    id: 'toggleToCancelled',
    name: 'Toggle To Cancelled',
    quickCode: 'tc',
    action: async () => { await toggleFocusedTaskStatus(plugin, 'Cancelled') }
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
          // await plugin.messaging.broadcast(`pomodoro:active:${focusedRem._id}`);
          await plugin.messaging.broadcast({
            type: 'pomodoroActive',
            remId: focusedRem._id,
          })
        })
    }
  });

  plugin.event.addListener(
    AppEvents.MessageBroadcast,
    undefined,
    async ({ message }) => {

      let { type, remId: taskRemId, fromStatus, toStatus } = message;

      if (type != 'task')
        return;

      const taskRem = (await plugin.rem.findOne(taskRemId))!;
      if (!fromStatus)
        fromStatus = await getStatusName(taskRem);

      // make sure there only one NOW task at the same time
      const nowTaskRemId = await plugin.storage.getSynced('nowTaskRemId') as string;

      // if recorded now task rem is removed
      const nowTaskRem = await plugin.rem.findOne(nowTaskRemId);
      if (!nowTaskRem)
        await plugin.storage.setSynced('nowTaskRemId', null);

      if (toStatus == 'Now') {
        if (nowTaskRemId) {
          await plugin.app.toast('Only one NOW task at the same time');
          return;
        } else {
          await plugin.storage.setSynced('nowTaskRemId', taskRemId);
        }
      }

      if (fromStatus == 'Now' && toStatus != 'Now') {
        await plugin.storage.setSynced('nowTaskRemId', null);
      }

      // set new status
      await setStatus(taskRem, toStatus, plugin);

      // add log
      const newTimeLog = await plugin.richText.parseFromMarkdown(`[${new Date().toLocaleString()}]   from **${fromStatus}** to **${toStatus}**`);
      await addTimeLog(newTimeLog, taskRem, plugin);

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
                // await plugin.messaging.broadcast(`task:${rem._id}::Done`);
                await plugin.messaging.broadcast({
                  type: 'task',
                  remId: rem._id,
                  toStatus: 'Done',
                })
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

  // request notification permission
  Notification.requestPermission().then(async (permission) => {
    if (permission == 'granted')
      await plugin.app.toast('[Swift GTD] Get notification permission successfully.');
    else
      return;
      // await plugin.app.toast('[Swift GTD] Failed to get notification permission. Please make sure the plugin is running in native mode');
  });

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
