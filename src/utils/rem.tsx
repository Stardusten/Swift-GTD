import { BuiltInPowerupCodes, RNPlugin } from '@remnote/plugin-sdk';

export const getFocusedRem = async (plugin: RNPlugin) => {
  const focusedRemId = await plugin.focus.getFocusedRemId();
  return focusedRemId ? await plugin.rem.findOne(focusedRemId) : undefined;
}

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ordinal = (day: number) => {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1:  return "st";
    case 2:  return "nd";
    case 3:  return "rd";
    default: return "th";
  }
}

export const getDailyDocumentName = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return `${months[month]} ${day}${ordinal(day)}, ${year}`;
}