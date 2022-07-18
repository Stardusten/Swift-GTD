import { Rem, RemId, RichTextInterface, RNPlugin } from '@remnote/plugin-sdk';
import { getFocusedRem, successors } from './rem';

const getDateDuration = (date1: Date, date2: Date) => {
  const diffDate = new Date(date2.getTime() - date1.getTime());

  const diffYear = diffDate.getUTCFullYear() - 1970;
  const diffMonth = diffDate.getUTCMonth();
  const diffDay = diffDate.getUTCDate() - 1;
  const diffHour = diffDate.getUTCHours();
  const diffMinute = diffDate.getUTCMinutes();
  const diffSecond = diffDate.getUTCSeconds();

  let result = '';
  if (diffYear > 0)   result += diffYear + 'y ';
  if (diffMonth > 0)  result += diffMonth + 'm ';
  if (diffDay > 0)    result += diffDay + 'd ';
  if (diffHour > 0)   result += diffHour + 'h ';
  if (diffMinute > 0) result += diffMinute + 'min ';
  if (diffSecond > 0) result += diffSecond + 's';

  return result;
}

export const isTaskRem = async (rem: Rem) => {
  return await rem.hasPowerup('taskPowerup');
}

/**
 * Generate ASCII progress bar. e.g. ★★★★★★★☆☆☆
 */
export const genAsciiProgressBar = (percentage: number, progressBarSymbol: string) => {
  const countSymbol = Math.floor(percentage * 10);
  return progressBarSymbol[0].repeat(countSymbol) +
    progressBarSymbol[1].repeat(10 - countSymbol);
}

export const setStatus = async (rem: Rem, statusName: string, plugin: RNPlugin) => {
  const statusPowerupRemRef = await plugin.richText.parseFromMarkdown(`[[${statusName}]]`);
  await rem.setPowerupProperty('taskPowerup', 'status', statusPowerupRemRef);
};

export const getStatusName = async (rem: Rem) => {
  const statusSlot = await rem.getPowerupProperty('taskPowerup', 'status');
  return statusSlot.trim();
}

export const padStatusName = (statusName: string) => {
  switch (statusName) {
    case 'Scheduled': return statusName;
    case 'Done': return statusName + '         ';
    case 'Ready': return statusName + '        ';
    case 'Now': return statusName + '           ';
    case 'Cancelled': return statusName + '  ';
    default:
      throw Error('Invalid statusName ' + statusName);
  }
}

/**
 * @param ifIsTask what to do if focused rem is already a task (has task powerup)
 * @param ifNotTask what to do if focused rem is NOT a task (has task powerup). do nothing by default.
 */
export const prevCheck = async (plugin: RNPlugin, ifIsTask: Function, ifNotTask?: Function) => {

  const focusedRem = await getFocusedRem(plugin);

  if (!focusedRem) {
    await plugin.app.toast('You are not focus at any rem.');
    return;
  }

  if (!(await isTaskRem(focusedRem)) && ifNotTask) {
    await ifNotTask(plugin, focusedRem);
    return;
  }

  await ifIsTask(plugin, focusedRem);

  return focusedRem;
}

export const newTask = async (plugin: RNPlugin) => {
  return await prevCheck(
    plugin,
    async (plugin: RNPlugin, focusedRem: Rem) => {
      await plugin.app.toast('Focused rem is already a task.');
    },
    async (plugin: RNPlugin, focusedRem: Rem) => {
      // add taskPowerup
      await focusedRem.addPowerup('taskPowerup');

      // set status to "Scheduled"
      await setStatus(focusedRem, 'Scheduled', plugin);

      // add create log
      let timeLog = `\n[${new Date().toLocaleString()}]   Scheduled`;
      await focusedRem.setPowerupProperty('taskPowerup', 'timeLog', [timeLog]);

      // handle progress bar
      await newTaskProgressUpdate(focusedRem, plugin);
  });
}

export const toggleFocusedToStatus = async (plugin: RNPlugin, newStatus: string) => {
  await prevCheck(
    plugin,
    async (plugin: RNPlugin, focusedRem: Rem) => {
      await toggleToStatus(plugin, newStatus, focusedRem);
    }
  )
}

export const toggleToStatus = async (plugin: RNPlugin, newStatus: string, rem: Rem) => {
  // get now status
  const nowStatus = await getStatusName(rem);

  // set new status
  await setStatus(rem, newStatus, plugin);

  // add log
  let timeLog = await rem.getPowerupProperty('taskPowerup', 'timeLog');
  timeLog += `\n[${new Date().toLocaleString()}]   ${padStatusName(nowStatus)}   →   ${padStatusName(newStatus)}`;
  await rem.setPowerupProperty('taskPowerup', 'timeLog', [timeLog]);

  // update status
  await toggleStatusProgressUpdate(rem, nowStatus, newStatus, plugin);
}

const newTaskProgressUpdate = async (taskRem: Rem, plugin: RNPlugin) => {
  for await (const rem of successors(taskRem)) {
    if (await isTaskRem(rem)) {
      const progress = await rem.getPowerupProperty('taskPowerup', 'progress');
      const progressBarSymbol = await plugin.settings.getSetting('progressBarSymbol') as string;
      if (!progress) {
        // has no subtask before
        await rem.setPowerupProperty('taskPowerup', 'progress', [`${progressBarSymbol[1].repeat(10)}   [0/1]`]);
      } else {
        // extract the progress from property
        const reg = /[★☆]*   \[(\d*)\/(\d*)]/;
        const resultArr = reg.exec(progress);
        if (resultArr) {
          const finishedNum = parseInt(resultArr[1]);
          const totalNum = parseInt(resultArr[2]) + 1;
          const newProgress = genAsciiProgressBar(finishedNum / totalNum, progressBarSymbol) + `   [${finishedNum}/${totalNum}]`;
          await rem.setPowerupProperty('taskPowerup', 'progress', [newProgress]);
        } else {
          await plugin.app.toast('ERROR | Invalid progress property.' + resultArr);
        }
      }
      // only consider direct parent task
      break;
    }
  }
}

export const toggleStatusProgressUpdate = async (taskRem: Rem, prevStatus: string, newStatus: string, plugin: RNPlugin) => {
  // handle subtask
  for await (const rem of successors(taskRem)) {
    if (await isTaskRem(rem)) {
      const progress = await rem.getPowerupProperty('taskPowerup', 'progress');
      const progressBarSymbol = await plugin.settings.getSetting('progressBarSymbol') as string;
      if (!progress) {
        // TODO be deleted manually?
      } else {
        // extract the progress from property
        const reg = /[★☆]*   \[(\d*)\/(\d*)]/;
        const resultArr = reg.exec(progress);
        if (resultArr) {
          let finishedNum;
          let totalNum;
          if (newStatus == 'Done' && prevStatus != 'Cancelled') {
            finishedNum = parseInt(resultArr[1]) + 1;
            totalNum = parseInt(resultArr[2]);
          } else if (newStatus == 'Done' && prevStatus == 'Cancelled') {
            finishedNum = parseInt(resultArr[1]) + 1;
            totalNum = parseInt(resultArr[2]) + 1;
          } else if (newStatus == 'Cancelled' && prevStatus != 'Done') {
            finishedNum = parseInt(resultArr[1]);
            totalNum = parseInt(resultArr[2]) - 1;
          } else if (newStatus == 'Cancelled' && prevStatus == 'Done') {
            finishedNum = parseInt(resultArr[1]) - 1;
            totalNum = parseInt(resultArr[2]) - 1;
          } else if (newStatus != 'Cancelled' && prevStatus == 'Done') {
            finishedNum = parseInt(resultArr[1]) - 1;
            totalNum = parseInt(resultArr[2]);
          } else {
            finishedNum = parseInt(resultArr[1]);
            totalNum = parseInt(resultArr[2]);
          }
          // update
          const newProgress = genAsciiProgressBar(finishedNum / totalNum, progressBarSymbol) + `   [${finishedNum}/${totalNum}]`;
          await rem.setPowerupProperty('taskPowerup', 'progress', [newProgress]);
          // if all subtask finished
          if (await rem.hasPowerup('automaticallyDone') && finishedNum == totalNum) {
            await toggleToStatus(plugin, 'Done', rem);
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

// export const updateAllProgressBar = async (plugin: RNPlugin) => {
//   return await prevCheck(
//     plugin,
//     async (plugin: RNPlugin, focusedRem: Rem) => {
//
//     }
//   )
// }