import {
  AppEvents,
  LoadingSpinner,
  Rem,
  RemHierarchyEditorTree,
  renderWidget,
  RNPlugin,
  usePlugin,
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
import { getTimeLogRootRem, prevCheck } from '../utils/gtd';

const totalTime = async (taskRem: Rem, plugin: RNPlugin) => {
  let totalTime = 0;
  let lastToggleNowTime;
  const reg = /\[(?<time>.*?)\]\s+(from\s+(?<fromStatus>\w+)\s+to\s+)?(?<toStatus>\w+)\s*$/;
  for (const descendant of await taskRem.getDescendants()) {
    const text = await plugin.richText.toString(descendant.text);
    const match = reg.exec(text);
    if (!match)
      continue;
    const time = new Date(match.groups!.time);
    const fromStatus = match.groups!.fromStatus;
    const toStatus = match.groups!.toStatus;

    if (toStatus == 'Now')
      lastToggleNowTime = time;

    if (fromStatus == 'Now' && toStatus != 'Now' && lastToggleNowTime) {
      totalTime += Math.floor((time.valueOf() - lastToggleNowTime.valueOf()) / 1000);
      lastToggleNowTime = undefined;
    }
  }

  // active now
  if (lastToggleNowTime != undefined)
    totalTime += Math.floor((new Date().valueOf() - lastToggleNowTime.valueOf()) / 1000);

  return totalTime;
}

const PopupTaskPane = () => {

  const plugin = usePlugin();

  const [timeLogRootRem, setTimeLogRootRem]: any = useState();

  useEffect(() => {
    plugin.event.addListener(
      AppEvents.MessageBroadcast,
      undefined,
      async ({ message }) => {
        if (message.type == 'popup_task_pane') {
          const taskRemId = message.remId;
          const taskRem = await plugin.rem.findOne(taskRemId);
          const timeLogRootRem = await getTimeLogRootRem(taskRem!, plugin);
          if (timeLogRootRem) {
            // console.log(await totalTime(timeLogRootRem, plugin));
            setTimeLogRootRem(timeLogRootRem);
          }
        }
      }
    )
  }, [])

  return (
    <div onMouseDown={e => e.stopPropagation()} className="popup-timelog-viewer p-[3px] rounded-lg box-border min-height-[2em]">
      <div className="overflow-y-scroll w-full rounded-lg shadow-md border-gray-100">
        <div className="p-4">
          {
            timeLogRootRem
              ? <RemHierarchyEditorTree
                  remId={ timeLogRootRem._id }
                  width="100%"
                ></RemHierarchyEditorTree>
              : <LoadingSpinner/>
          }
        </div>
      </div>
    </div>
  );
}

renderWidget(PopupTaskPane);