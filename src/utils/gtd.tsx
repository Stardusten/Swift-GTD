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

  if (!(await focusedRem.hasPowerup('taskPowerup')) && ifNotTask) {
    await ifNotTask(plugin, focusedRem);
    return;
  }

  await ifIsTask(plugin, focusedRem);
}

export const createNewTask = async (plugin: RNPlugin) => {
  await prevCheck(
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
  });
}

export const toggleToStatus = async (plugin: RNPlugin, newStatus: string) => {
  await prevCheck(
    plugin,
    async (plugin: RNPlugin, focusedRem: Rem) => {

      // get now status
      const nowStatus = await getStatusName(focusedRem);

      // set new status
      await setStatus(focusedRem, newStatus, plugin);

      // add log
      let timeLog = await focusedRem.getPowerupProperty('taskPowerup', 'timeLog');
      timeLog += `\n[${new Date().toLocaleString()}]   ${padStatusName(nowStatus)}   →   ${padStatusName(newStatus)}`;
      await focusedRem.setPowerupProperty('taskPowerup', 'timeLog', [timeLog]);
    }
  )
}

