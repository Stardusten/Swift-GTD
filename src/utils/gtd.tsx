import { Rem, RemId, RichTextInterface, RNPlugin } from '@remnote/plugin-sdk';
import { getFocusedRem } from './rem';

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

export const setStatus = async (rem: Rem, statusName: string, plugin: RNPlugin) => {
  const statusPowerupRemRef = await plugin.richText.parseFromMarkdown(`[[${statusName}]]`);
  await rem.setPowerupProperty('taskPowerup', 'status', statusPowerupRemRef);
};

export const getStatusName = async (rem: Rem) => {
  const statusSlot = await rem.getPowerupProperty('taskPowerup', 'status');
  return statusSlot.trim();
}

export const toggleToTask = async (plugin: RNPlugin) => {

  const focusedRem = await getFocusedRem(plugin);

  if (!focusedRem) {
    await plugin.app.toast('You are not focus at any rem.');
    return;
  }

  if (await focusedRem.hasPowerup('taskPowerup')) {
    await plugin.app.toast('Focused rem is already a task.');
    return;
  }

  await focusedRem.addPowerup('taskPowerup');

  // initial status: Later
  await setStatus(focusedRem, 'Later', plugin);

  // record createTime
  const now = [new Date().toUTCString()];
  await focusedRem.setPowerupProperty('taskPowerup', 'createTime', now);
}

export const toggleTaskDone = async (plugin: RNPlugin) => {

  const focusedRem = await getFocusedRem(plugin);

  if (!focusedRem) {
    await plugin.app.toast('You are not focus at any rem.');
    return;
  }

  if (!(await focusedRem.hasPowerup('taskPowerup'))) {
    await plugin.app.toast('Focused rem is not a task.');
    return;
  }

  switch (await getStatusName(focusedRem)) {

    case 'Done': {
      await plugin.app.toast('Focused rem is already done.');
      return;
    }

    case 'Now': {
      await plugin.app.toast('You finish a task.');

      // toggle to Done status
      await setStatus(focusedRem, 'Done', plugin);

      // record finishTime
      const now = new Date();
      await focusedRem.setPowerupProperty('taskPowerup', 'finishTime', [now.toUTCString()]);

      const startTimeStr = await focusedRem.getPowerupProperty('taskPowerup', 'startTime');

      if (!startTimeStr) {
        // TODO
      }

      const startTime = new Date(startTimeStr);
      await focusedRem.setPowerupProperty('taskPowerup', 'duration', [getDateDuration(startTime, now)]);

      return;
    }

    case 'Later':
    case 'Cancelled': {
      // Now status is skipped!!
      await plugin.app.toast('You finish a task.');

      // toggle to Done status
      await setStatus(focusedRem, 'Done', plugin);

      // record startTime & finishTime
      const now = new Date();
      await focusedRem.setPowerupProperty('taskPowerup', 'startTime', [now.toUTCString()]);
      await focusedRem.setPowerupProperty('taskPowerup', 'finishTime', [now.toUTCString()]);
      await focusedRem.setPowerupProperty('taskPowerup', 'duration', ['0s']);
      return;
    }
  }
}

export const toggleTaskNow = async (plugin: RNPlugin) => {

  const focusedRem = await getFocusedRem(plugin);

  if (!focusedRem) {
    await plugin.app.toast('You are not focus at any rem.');
    return;
  }

  if (!(await focusedRem.hasPowerup('taskPowerup'))) {
    await plugin.app.toast('Focused rem is not a task.');
    return;
  }

  switch (await getStatusName(focusedRem)) {

    case 'Now': {
      await plugin.app.toast('Focused task is already in Now status.');
      return;
    }

    case 'Later': {
      await plugin.app.toast('Start doing a task!');

      // toggle to Now status
      await setStatus(focusedRem, 'Now', plugin);

      // if startTime is never recorded, record it
      const now = new Date();
      const oldStartTime = await focusedRem.getPowerupProperty('taskPowerup', 'startTime');
      if (!oldStartTime || oldStartTime.trim() === '') {
        await focusedRem.setPowerupProperty('taskPowerup', 'startTime', [now.toUTCString()]);
      }

      return;
    }

    case 'Cancelled': {

      await plugin.app.toast('Restart a task!');

      // toggle to Now status
      await setStatus(focusedRem, 'Now', plugin);

      // if startTime is never recorded, record it
      const now = new Date();
      const oldStartTime = await focusedRem.getPowerupProperty('taskPowerup', 'startTime');
      if (!oldStartTime || oldStartTime.trim() === '') {
        await focusedRem.setPowerupProperty('taskPowerup', 'startTime', [now.toUTCString()]);
      }
      return;
    }

    case 'Done': {

      await plugin.app.toast('Focused task is Done before. Continue working on it.');

      // toggle to Now status
      await setStatus(focusedRem, 'Now', plugin);

      // append reopen annotation
      const oldFinishTime = await focusedRem.getPowerupProperty('taskPowerup', 'finishTime');
      await focusedRem.setPowerupProperty('taskPowerup', 'startTime', [oldFinishTime + ' (Before Reopen)']);
    }
  }
}

export const toggleTaskLater = async (plugin: RNPlugin) => {

  const focusedRem = await getFocusedRem(plugin);

  if (!focusedRem) {
    await plugin.app.toast('You are not focus at any rem.');
    return;
  }

  if (!(await focusedRem.hasPowerup('taskPowerup'))) {
    await plugin.app.toast('Focused rem is not a task.');
    return;
  }

  switch (await getStatusName(focusedRem)) {

    case 'Later': {
      await plugin.app.toast('Focused task is already in Later status.');
      return;
    }

    case 'Now': {
      await plugin.app.toast('Putting focused task on hold');

      // toggle to Later status
      await setStatus(focusedRem, 'Later', plugin);

      return;
    }

    case 'Cancelled': {
      await plugin.app.toast('Consider doing focused task later.');

      // toggle to Later status
      await setStatus(focusedRem, 'Later', plugin);

      return;
    }

    case 'Done': {
      await plugin.app.toast('Focused task is Done before. Restart it later.');

      // toggle to Later status
      await setStatus(focusedRem, 'Later', plugin);
    }
  }
}

export const toggleTaskCancelled = async (plugin: RNPlugin) => {

  const focusedRem = await getFocusedRem(plugin);

  if (!focusedRem) {
    await plugin.app.toast('You are not focus at any rem.');
    return;
  }

  if (!(await focusedRem.hasPowerup('taskPowerup'))) {
    await plugin.app.toast('Focused rem is not a task.');
    return;
  }

  switch (await getStatusName(focusedRem)) {

    case 'Cancelled': {
      await plugin.app.toast('Focused task is already in Cancelled status.');
      return;
    }

    case 'Now':
    case 'Later':
    case 'Done': {
      await plugin.app.toast('Focused task is cancelled.');

      // toggle to Cancelled status
      await setStatus(focusedRem, 'Cancelled', plugin);

      // record cancelled time
      const now = new Date();
      await focusedRem.setPowerupProperty('taskPowerup', 'cancelledTime', [now.toUTCString()]);
    }
  }
}