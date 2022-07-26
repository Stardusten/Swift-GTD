import { AppEvents, renderWidget, usePlugin } from '@remnote/plugin-sdk';
import { useEffect, useRef, useState } from 'react';
import { getStatusName, isTaskRem } from '../utils/gtd';
import { getFocusedRem } from '../utils/rem';

const colorMap = new Map([
  ['Scheduled', ['#e7f6ff', '#3093ce']], // [background, foreground]
  ['Ready', ['#fff8d9', '#c9a60e']],
  ['Now', ['#ffe8dd', '#da581a']],
  ['Done', ['#d1ffee', '#0a9f68']],
  ['Cancelled', ['#e7e7ef', '#515167']],
]);

// bug log: when receive a task / taskNew message, if use getStatusName() to get the status
// then you must wait until task update finished
export const TaskPeeker =  () => {

  const plugin = usePlugin();
  let remIdWidgetIn: string;
  const [statusChar, setStatusChar] = useState('');
  const [color, setColor] = useState(colorMap.get('Cancelled')!);

  const update = async (toStatus?: string) => {
    const context = await plugin.widget.getWidgetContext();
    remIdWidgetIn = context.remId;
    const remWidgetIn = await plugin.rem.findOne(remIdWidgetIn);
    if (remWidgetIn && await isTaskRem(remWidgetIn)) {
      // only display for task rem

      // set background color according to the status of task
      if (toStatus) {
        setColor(() => colorMap.get(toStatus)!);
        setStatusChar(() => toStatus[0]);
      }
      else {
        const status = await getStatusName(remWidgetIn);
        setColor(() => colorMap.get(status)!);
        setStatusChar(() => status[0]);
      }
    }
  }

  useEffect(() => {

    update().then().catch(console.error);

    plugin.event.addListener(
      AppEvents.MessageBroadcast,
      undefined,
      async ({ message }) => {
        if (message.type == 'task' && message.remId == remIdWidgetIn)
          await update(message.toStatus);
        else if (message.type == 'taskNew' && message.remId == remIdWidgetIn)
          await update('Scheduled');
      }
    )
  }, []);

  return (
    statusChar ? <div
      className="task-peeker cursor-pointer select-none hover:bg-gray-20 text-gray-70 text-[12px] font-semibold fade-on-hide-ui"
      style={{ backgroundColor: color[0], borderColor: color[0], color: color[1] }}
      onClick={async () => {
        const context = await plugin.widget.getWidgetContext();
        const dim = await plugin.widget.getDimensions(context.widgetInstanceId);
        await plugin.window.openFloatingWidget(
          'popup_timelog_viewer',
          { top: dim.top + 30, left: dim.left - 300 }
        );
        // XXX ugly
        setTimeout(async () => {
          await plugin.messaging.broadcast({
            type: 'popup_timelog_viewer_id',
            remId: context.remId,
          });
        }, 500);
      }}
    >{ statusChar }</div> : <></>
  );
}

renderWidget(TaskPeeker);