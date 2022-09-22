import { AppEvents, Rem, renderWidget, usePlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { useEffect, useRef, useState } from 'react';
import { getStatusName, isTaskRem, toggleFocusedTaskStatus, toggleTaskStatus } from '../utils/gtd';
import { getFocusedRem } from '../utils/rem';

const colorMap = new Map([
  ['Scheduled', ['#e7f6ff', '#3093ce']], // [background, foreground, hover]
  ['Ready', ['#fff8d9', '#c9a60e']],
  ['Now', ['#ffe8dd', '#da581a']],
  ['Done', ['#d1ffee', '#0a9f68']],
  ['Cancelled', ['#f2f2f6', '#717195']],
]);

// bug log: when receive a task / taskNew message, if use getStatusName() to get the status
// then you must wait until task update finished
export const TaskPeeker =  () => {

  const plugin = usePlugin();
  let remWidgetIn: any = useRef();

  const [statusChar, setStatusChar] = useState('');
  const [color, setColor] = useState(colorMap.get('Cancelled')!);
  const [hover, setHover] = useState(false);

  const update = async (toStatus?: string) => {
    const context = await plugin.widget.getWidgetContext<WidgetLocation.RightSideOfEditor>();
    const remIdWidgetIn = context.remId;
    remWidgetIn.current = (await plugin.rem.findOne(remIdWidgetIn))!;
    if (remWidgetIn.current && await isTaskRem(remWidgetIn.current)) {
      // only display for task rem

      // set background color according to the status of task
      if (toStatus) {
        setColor(() => colorMap.get(toStatus)!);
        setStatusChar(() => toStatus[0]);
      }
      else {
        const status = await getStatusName(remWidgetIn.current);
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
        if (message.type == 'task' && message.remId == remWidgetIn.current._id)
          await update(message.toStatus);
        else if (message.type == 'taskNew' && message.remId == remWidgetIn.current._id)
          await update('Scheduled');
      }
    );
  }, []);

  const QuickAccessOnHover = () => {
    return (
      <div className="flex px-3">
        <div className="flex-1 inline-block px-1 rounded hover:brightness-50" onClick={ async () => { await toggleTaskStatus(plugin, 'Scheduled', remWidgetIn.current) } }>S</div>
        <div className="flex-1 inline-block px-1 rounded hover:brightness-50" onClick={ async () => { await toggleTaskStatus(plugin, 'Ready', remWidgetIn.current) } }>R</div>
        <div className="flex-1 inline-block px-1 rounded hover:brightness-50" onClick={ async () => { await toggleTaskStatus(plugin, 'Now', remWidgetIn.current) } }>N</div>
        <div className="flex-1 inline-block px-1 rounded hover:brightness-50" onClick={ async () => { await toggleTaskStatus(plugin, 'Done', remWidgetIn.current) } }>D</div>
        <div className="flex-1 inline-block px-1 rounded hover:brightness-50" onClick={ async () => { await toggleTaskStatus(plugin, 'Cancelled', remWidgetIn.current) } }>C</div>
      </div>
    );
  }

  return (
    statusChar ? <div
      className="task-peeker cursor-pointer select-none hover:bg-gray-20 text-gray-70 text-[12px] font-semibold fade-on-hide-ui"
      style={{ backgroundColor: color[0], borderColor: color[0], color: color[1] }}
      /* onClick={ async () => {
        const context = await plugin.widget.getWidgetContext();
        const dim = await plugin.widget.getDimensions(context.widgetInstanceId);
        await plugin.window.openFloatingWidget(
          'popup_task_pane',
          { top: dim.top + 30, left: dim.left - 300 }
        );
        // XXX ugly
        setTimeout(async () => {
          await plugin.messaging.broadcast({
            type: 'popup_task_pane',
            remId: context.remId,
          });
        }, 500);
      }} */
      onMouseEnter={ () => setHover(true) }
      onMouseLeave={ () => setHover(false) }
    >{
      hover ? <QuickAccessOnHover/> : <div>{ statusChar }</div>
    }</div> : <></>
  );
}

renderWidget(TaskPeeker);
