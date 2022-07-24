import { Rem, RemId, RichTextInterface, RNPlugin, usePlugin } from '@remnote/plugin-sdk';
import { getFocusedRem, successors } from './rem';

export declare type StatusName = 'Scheduled' | 'Ready' | 'Now' | 'Done' | 'Cancelled';

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

/**
 * Determine whether a rem is task or not.
 * @param rem
 */
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

/**
 * Set status of a task rem.
 * @param rem
 * @param statusName
 * @param plugin
 */
export const setStatus = async (rem: Rem, statusName: StatusName, plugin: RNPlugin) => {
  const statusPowerupRemRef = await plugin.richText.parseFromMarkdown(`[[${statusName}]]`);
  await rem.setPowerupProperty('taskPowerup', 'status', statusPowerupRemRef);
};

/**
 * Get status name of a task rem.
 * @param rem
 */
export const getStatusName = async (rem: Rem) => {
  const statusSlot = await rem.getPowerupProperty('taskPowerup', 'status');
  return statusSlot.trim();
}

export const getTimeLogRootRem = async (rem: Rem, plugin: RNPlugin) => {
  const refs = await rem.remsReferencingThis();
  const timeLogPowerup = (await plugin.powerup.getPowerupByCode('timeLog'))!;
  for (const ref of refs) {
    const parentRem = await ref.getParentRem();
    if (parentRem?._id == timeLogPowerup._id)
      return ref;
  }
}

/**
 * Add a timelog of a task.
 * Attention:
 *   - only call this function on a task!
 *   - each timelog is a **card**, front should be timestamp, back should be message.
 */
export const addTimeLog = async (front: RichTextInterface, rem: Rem, plugin: RNPlugin, back?: RichTextInterface) => {
  let timeLogRootRem = await getTimeLogRootRem(rem, plugin);
  const timeLogPowerup = (await plugin.powerup.getPowerupByCode('timeLog'))!;
  if (!timeLogRootRem) {
    // not exist? create one
    timeLogRootRem = (await plugin.rem.createRem())!;
    // add reference to rem
    const text = plugin.richText.rem(rem._id).value();
    await timeLogRootRem.setText(text);
    // move to timeLog
    await timeLogRootRem.setParent(timeLogPowerup._id);
  }

  const newTimeLog = await plugin.rem.createRem();
  await newTimeLog?.setText(front);

  // if back content is provided
  if (back) {
    await newTimeLog?.setIsCardItem(true);
    await newTimeLog?.setBackText(back);
  }

  await newTimeLog?.setParent(timeLogRootRem._id);
  await timeLogRootRem.setIsCardItem(false); // XXX
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

export const toggleTaskStatus = async (plugin: RNPlugin, toStatus: string) => {
  const focusedRem = await getFocusedRem(plugin);

  if (!focusedRem) {
    await plugin.app.toast('You are not focus at any rem.');
    return;
  }

  if (!(await isTaskRem(focusedRem))) {
    return;
  }

  // await plugin.messaging.broadcast(`task:${focusedRem._id}:${await getStatusName(focusedRem)}:${toStatus}`);
  await plugin.messaging.broadcast({
    type: 'task',
    remId: focusedRem._id,
    fromStatus: await getStatusName(focusedRem),
    toStatus
  });
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

  if (!(await isTaskRem(focusedRem))) {
    if (ifNotTask)
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
      let newTimeLog = await plugin.richText.parseFromMarkdown(`[${new Date().toLocaleString()}]   create new, **Scheduled**`);
      await addTimeLog(newTimeLog, focusedRem, plugin);

      // handle progress bar
      await newTaskProgressUpdate(focusedRem, plugin);

      // send message
      await plugin.messaging.broadcast({
        type: 'taskNew',
        remId: focusedRem._id
      });
  });
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

/**
 * Update progress of all tasks in focused rem tree.
 *
 * When you move / delete / indent / unindent some tasks, this will help you correct related progresses.
 */
export const updateRemTreeProgress = async (plugin: RNPlugin, fromRem: Rem) => {
  let topTask = fromRem;
  for await (const successor of successors(fromRem)) {
    if (await isTaskRem(successor))
      topTask = successor;
  }
  if (topTask)
    await _updateRemTreeProgress(plugin, topTask);
}

export const _updateRemTreeProgress = async (plugin: RNPlugin, rem: Rem) => {
  let finishedNum = 0;
  let totalNum = 0;
  // find the rem that progress property in (in following iteration)
  let progressRem;
  for (const descendant of await rem.getDescendants()) {

    if (!progressRem && await descendant.isPowerupProperty()) {
      const text = await plugin.richText.toString(descendant.text);
      if (text == 'Progress')
        progressRem = descendant;
    }

    if (await isTaskRem(descendant)) {
      // update descendant recursively
      await _updateRemTreeProgress(plugin, descendant);

      const status = await getStatusName(descendant);
      if (status != 'Cancelled') {
        totalNum += 1;
        if (status == 'Done')
          finishedNum += 1;
      }
    }
  }
  if (totalNum != 0) {
    // update
    const progressBarSymbol = await plugin.settings.getSetting('progressBarSymbol') as string;
    const newProgress = genAsciiProgressBar(finishedNum / totalNum, progressBarSymbol) + `   [${finishedNum}/${totalNum}]`;
    await rem.setPowerupProperty('taskPowerup', 'progress', [newProgress]);
    // if all subtask finished
    if (await rem.hasPowerup('automaticallyDone') && finishedNum == totalNum) {
      // await plugin.messaging.broadcast(`task:${rem._id}::Done`);
      await plugin.messaging.broadcast({
        type: 'task',
        remId: rem._id,
        toStatus: 'Done',
      });
    }
  } else {
    // await plugin.app.toast(`${rem.text} has no subtask`);
    if (progressRem) progressRem.remove();
  }
}

export const getPowerupProperty = async (rem: Rem, powerupName: string, plugin: RNPlugin) => {
  for (const descendant of await rem.getDescendants()) {
    if (await descendant.isPowerupProperty()) {
      const text = await plugin.richText.toString(descendant.text);
      if (text == powerupName)
        return descendant;
    }
  }
  return null;
}

/**
 * Return a map, key: name of property, value: rem
 */
export const getPowerupProperties = async (rem: Rem, plugin: RNPlugin) => {
  const result = new Map();
  for (const descendant of await rem.getDescendants()) {
    if (await descendant.isPowerupProperty()) {
      const text = await plugin.richText.toString(descendant.text);
      result.set(text, descendant);
    }
  }
  return result;
}