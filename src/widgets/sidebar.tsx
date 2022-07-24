import {
  AppEvents, Rem, RemHierarchyEditorTree, RemId, RemRichTextEditor, RemViewer,
  renderWidget,
  RichText, RNPlugin, useAPIEventListener,
  usePlugin,
  useRunAsync,
  useSessionStorageState,
  useTracker,
} from '@remnote/plugin-sdk';
import { SetStateAction, useEffect, useRef, useState } from 'react';
import { getPowerupProperties, getTimeLogRootRem, isTaskRem, newTask, prevCheck, toggleTaskStatus } from '../utils/gtd';
import { getFocusedRem } from '../utils/rem';

const SideBarWidget = () => {
  return (
    <div
      className="rn-plugin-sidebar box-border h-full p-2 overflow-y-auto"
    >
      <h2
        style={{
          display: 'block',
          fontSize: '1.5em',
          marginBlockStart: '0.83em',
          marginBlockEnd: '0.83em',
          marginInlineStart: '0px',
          marginInlineEnd: '0px',
          marginLeft: '0.2em',
          fontWeight: 'bold',
        }}
      >Swift GTD</h2>
      <TaskToggleQuickAccess></TaskToggleQuickAccess>
      <Pomodoro></Pomodoro>
      <TaskOverview></TaskOverview>
      <TimeLog></TimeLog>
    </div>
  );
}

const TaskToggleQuickAccess = () => {
  const plugin = usePlugin();
  return (
    <div className="rn-plugin rn-card flex flex-col mb-2 bg-white">
      <div
        className="rn-card__header flex items-center flex-shrink-0 gap-2 p-2 text-lg font-semibold"
        style={{ display: 'inline-block' }}
      >Quick Access</div>
      <div className="rn-card__content flex flex-col gap-2 p-2">
        <div className="gtd-inline-row">
          <div className="gtd-button" onClick={ async () => { await newTask(plugin) } }>New</div>
          <div className="gtd-button" onClick={ async () => { await toggleTaskStatus(plugin, 'Scheduled') } }>Scheduled</div>
          <div className="gtd-button" onClick={ async () => { await toggleTaskStatus(plugin, 'Ready') } }>Ready</div>
        </div>
        <div className="gtd-inline-row">
          <div className="gtd-button" onClick={ async () => { await toggleTaskStatus(plugin, 'Now') } }>Now</div>
          <div className="gtd-button" onClick={ async () => { await toggleTaskStatus(plugin, 'Done') } }>Done</div>
          <div className="gtd-button" onClick={ async () => { await toggleTaskStatus(plugin, 'Cancelled') } }>Cancelled</div>
        </div>
      </div>
    </div>
  );
}

const Pomodoro = () => {
  const plugin = usePlugin();

  // how many seconds the active pomodoro rest. if there's no active pomodoro, 0
  const [restHms, setRestHms] = useState([0, 0, 0]);

  // timerId from setTimeout, record this to cancel timeout function when user give up a pomodoro manually.
  const [timerId, setTimerId]: any = useState();

  // count down of new pomodoro. specified by user in <input/>
  const [cdStr, setCdStr] = useState('');
  const cdStrRef = useRef(cdStr);
  useEffect(() => { cdStrRef.current = cdStr; } ); // manually update cdStrRef

  // remId of active task's id
  const [taskRemId, setTaskRemId]: any = useState();

  useEffect(() => {

    // load default pomodoro time
    plugin.settings.getSetting('defaultPomodoroTime')
      .then((result) => {
        setCdStr(result as string);
      })
      .catch(console.error);

    // try to recover unfinish timer
    plugin.storage.getSynced('unfinishedPomodoro')
      .then((unfinishedPomodoro) => {
        if (unfinishedPomodoro) {
          const [finishTime, taskRemId] = unfinishedPomodoro;
          let restSecsTotal = (new Date(finishTime).valueOf() - new Date().valueOf()) / 1000;
          if (restSecsTotal > 0) { // there exists an unfinished old pomodoro
            const restHours = Math.floor(restSecsTotal / 3600);
            restSecsTotal %= 3600;
            const restMins = Math.floor(restSecsTotal / 60);
            const restSecs = Math.floor(restSecsTotal % 60);
            setRestHms([restHours, restMins, restSecs]);
            setTaskRemId(taskRemId);
          } else {
            // there exists an old pomodoro, but it's overtime now.
            // TODO
          }
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    // not finished
    if (JSON.stringify(restHms) != JSON.stringify([0, 0, 0])) {
      const id = setTimeout(() => {
        setRestHms((prev) => decHms(prev));
      }, 1000);
      setTimerId(id);
    } else if (taskRemId) { // finished
      setTimerId(null);
      plugin.storage.setSynced('unfinishedPomodoro', null).then().catch(console.error);
      // send notification
      const noti = new Notification(
        'A pomodoro is finished. Time to take a break!',
        {
          requireInteraction: true
        });
      // notify all listeners that this pomodoro has finished
      // plugin.messaging.broadcast(`task:${taskRemId}:Now:Ready`).then().catch(console.error);
      plugin.messaging.broadcast({
        type: 'task',
        remId: taskRemId,
        fromStatus: 'Now',
        toStatus: 'Ready'
      }).then().catch(console.error);
    }
  }, [restHms]);

  // handle new pomodoro request
  useEffect(() => {

    plugin.event.addListener(
      AppEvents.MessageBroadcast,
      undefined,
      async ({ message }) => {

        console.log(message);

        let { type, remId: _taskRemId } = message;

        if (type != 'pomodoroActive')
          return;

        const unfinishedPomodoro = await plugin.storage.getSynced('unfinishedPomodoro');
        if (unfinishedPomodoro) {
          console.log(JSON.stringify(unfinishedPomodoro));
          await plugin.app.toast('You cannot do two pomodoro at the same time!');
          return;
        }

        setTaskRemId(_taskRemId);

        const regCdStr = /^\s*(?:(?<h>\d*)h)?\s*(?:(?<min>\d*)min)?\s*(?:(?<s>\d*)s)?\s*$/;
        const matchCdStr = regCdStr.exec(cdStrRef.current);

        if (!matchCdStr) {
          await plugin.app.toast('Invalid count down format.');
          return;
        }

        // extract hours, minutes, seconds
        const h = matchCdStr.groups!.h     ? parseInt(matchCdStr.groups!.h)   : 0;
        const min = matchCdStr.groups!.min ? parseInt(matchCdStr.groups!.min) : 0;
        const s = matchCdStr.groups!.s     ? parseInt(matchCdStr.groups!.s)   : 0;

        setRestHms([h, min, s]);

        // set status to now
        // plugin.messaging.broadcast(`task:${_taskRemId}::Now`).then().catch(console.error);
        plugin.messaging.broadcast({
          type: 'task',
          remId: _taskRemId,
          toStatus: 'Now',
        }).then().catch(console.error);

        // save to synced storage
        const finishTime = new Date(new Date().getTime() + (3600 * h + 60 * min + s) * 1000);
        await plugin.storage.setSynced('unfinishedPomodoro', [finishTime, _taskRemId]);
      });
  }, []);

  return (
    <div className="rn-plugin rn-card flex flex-col mb-2 bg-white">
      <div
        className="rn-card__header flex items-center flex-shrink-0 gap-2 p-2 text-lg font-semibold"
        style={{ display: 'inline-block' }}
      >Pomodoro</div>
      <div className="rn-card__content flex flex-col gap-2 p-2">
        <div
          className="gtd-timer"
        >
          <span>{ restHms[0] }</span>
          <span style={{ color: '#ACACC0', marginLeft: '0.1em' }}>h  </span>
          <span>{ restHms[1] }</span>
          <span style={{ color: '#ACACC0', marginLeft: '0.1em' }}>min  </span>
          <span>{ restHms[2] }</span>
          <span style={{ color: '#ACACC0', marginLeft: '0.1em' }}>s  </span>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <input
            className="gtd-pomodoro-time-input"
            value={ cdStr }
            onChange={ (e) => setCdStr(e.target.value) }
            placeholder={'Type cd here: e.g. 2h13min'}
          />
        <PomodoroButton
          isPomodoroActive={ timerId }
          onActiveClick={ async () => {
            clearTimeout(timerId);
            // reset restHms
            setRestHms([0, 0, 0]);
            setTimerId(null);
            await plugin.storage.setSynced('unfinishedPomodoro', null);
            // send notification
            const noti = new Notification(
              'A pomodoro is cancelled.',
              {
                requireInteraction: true
              });
            // notify all listeners that this pomodoro is cancelled
            plugin.messaging.broadcast({
              type: 'task',
              remId: taskRemId,
              fromStatus: 'Now',
              toStatus: 'Ready'
            }).then().catch(console.error);
          }}
          onInactiveClick={ async () => {
            return await prevCheck(
              plugin,
              async (plugin: RNPlugin, focusedRem: Rem) => {
                // await plugin.messaging.broadcast(`pomodoro:active:${focusedRem._id}`);
                await plugin.messaging.broadcast({
                  type: 'pomodoroActive',
                  remId: focusedRem._id,
                });
            });
          }}
        ></PomodoroButton>
        </div>
      </div>
    </div>
  );
}

/**
 * A button that control start and cancel of a pomodoro.
 */
const PomodoroButton = (props: any) => {
  const isPomodoroActive = props.isPomodoroActive;
  if (isPomodoroActive)
    return (
      <div
        className="gtd-button"
        onClick={ props.onActiveClick }
      >Cancel</div>
    );
  else return (
    <div
      className="gtd-button"
      onClick={ props.onInactiveClick }
    >Start</div>
  );
}

const TaskOverview = () => {

  const plugin = usePlugin();

  const [targets, setTargets]: any = useState();

  const updateTaskOverview = async () => {
    const taskPowerupRem = (await plugin.powerup.getPowerupByCode('taskPowerup'))!;
    const taskRems = await taskPowerupRem.taggedRem();

    const now: any = [];
    const ready: any = [];
    const scheduled: any = [];

    for (const taskRem of taskRems) {
      const status = await taskRem.getPowerupProperty('taskPowerup', 'status');

      switch (status) {
        case 'Ready':
          ready.push(taskRem);
          break;
        case 'Now':
          now.push(taskRem);
          break;
        case 'Scheduled':
          scheduled.push(taskRem);
          break;
        default:
      }
    }

    setTargets({ now, ready, scheduled });
  }

  // update task overview when widget loaded
  useEffect(() => {
    updateTaskOverview().then().catch(console.error);
  }, []);

  // update task overview when receive message about task
  useAPIEventListener(
    AppEvents.MessageBroadcast,
    undefined,
    async ({ message }) => {
      if (message.type == 'task' || message.type == 'taskNew')
        await updateTaskOverview();
    });

  const Tasks = (props: any) => {
    return (
      <div
        /* only display when there are such tasks */
        style={{ display: !props.display  || props.display.length == 0 ? 'none' : 'block' }}
      >
        <div className="task-overview-title">{ props.title }</div>
        <div
          className="task-overview-tasks"
        >
          {
            props.rems?.map((rem: Rem, idx: number) => {
              return (
                <div
                  className="task-overview-task"
                  onClick={ async () => {
                    await plugin.window.openRem(rem);
                  }}
                >
                  <RemViewer
                    remId={rem._id}
                    width="100%"
                  ></RemViewer>
                </div>
              );
            })
          }
        </div>
      </div>
    );
  }

  return (
    <div className="rn-plugin rn-card flex flex-col mb-2 bg-white">
      <div
        className="rn-card__header flex items-center flex-shrink-0 gap-2 p-2 text-lg font-semibold"
        style={{ display: 'inline-flex' }}
      >
        <span>Task Overview</span>
        <div /* refresh button */
          className="icon-button inline-block ml-auto hover:rn-clr-background--hovered cursor-pointer rounded object-contain max-w-fit box-border p-0.5"
          onClick={ updateTaskOverview }
        >
          <svg fill="currentColor" viewBox="0 0 20 20" data-icon="reload" className="inline-block"
               style={{ width: '20px', minWidth: '20px', height: '20px', minHeight: '20px', display: 'block'}}>
            <path d="M10.435 1.66979C5.83697 1.54306 2.07004 5.24522 2.07004 9.81635H0.453057C0.0465531 9.81635 -0.152182 10.3051 0.136887 10.5858L2.65721 13.1112C2.83788 13.2922 3.11791 13.2922 3.29858 13.1112L5.8189 10.5858C6.09894 10.3051 5.9002 9.81635 5.4937 9.81635H3.87672C3.87672 6.28617 6.74934 3.43488 10.2904 3.48013C13.6509 3.52539 16.4783 6.35859 16.5235 9.72584C16.5687 13.2651 13.7231 16.1526 10.2001 16.1526C9.07093 16.1526 8.01402 15.8448 7.09261 15.3289C6.74031 15.1297 6.30671 15.2021 6.02667 15.4918C5.61114 15.9082 5.69244 16.6233 6.20734 16.9129C7.39072 17.5737 8.74573 17.9629 10.2001 17.9629C14.762 17.9629 18.4566 14.1883 18.3302 9.58101C18.2127 5.33574 14.6716 1.78746 10.435 1.66979Z"></path>
          </svg>
        </div>
      </div>
      <div className="rn-card__content flex flex-col gap-2 p-2">
        <Tasks title={ 'Now' } display={ targets?.now } rems={ targets?.now }></Tasks>
        <Tasks title={ 'Ready' } display={ targets?.ready } rems={ targets?.ready }></Tasks>
        <Tasks title={ 'Scheduled' } display={ targets?.scheduled } rems={ targets?.scheduled }></Tasks>
      </div>
    </div>
  );
}

const TimeLog = () => {

  const plugin = usePlugin();

  const [timeLogRootRemId, setTimeLogRootRemId]: any = useState();

  return (
    <div className="rn-plugin rn-card flex flex-col mb-2 bg-white">
      <div
        className="rn-card__header flex items-center flex-shrink-0 gap-2 p-2 text-lg font-semibold"
        style={{ display: 'inline-flex' }}
      >
        <div>Time Log</div>
        <div /* refresh button */
          className="icon-button inline-block ml-auto hover:rn-clr-background--hovered cursor-pointer rounded object-contain max-w-fit box-border p-0.5"
          onClick={ async () => {
            await prevCheck(plugin,
            async (plugin: RNPlugin, focusedRem: Rem) => {
                const timeLogRootRem = await getTimeLogRootRem(focusedRem, plugin);
                if (timeLogRootRem)
                  setTimeLogRootRemId(timeLogRootRem._id);
                else setTimeLogRootRemId(null);
              },
              async () => { setTimeLogRootRemId(null) }
              );
          }}
        >
          <svg fill="currentColor" viewBox="0 0 20 20" data-icon="reload" className="inline-block"
               style={{ width: '20px', minWidth: '20px', height: '20px', minHeight: '20px', display: 'block'}}>
            <path d="M10.435 1.66979C5.83697 1.54306 2.07004 5.24522 2.07004 9.81635H0.453057C0.0465531 9.81635 -0.152182 10.3051 0.136887 10.5858L2.65721 13.1112C2.83788 13.2922 3.11791 13.2922 3.29858 13.1112L5.8189 10.5858C6.09894 10.3051 5.9002 9.81635 5.4937 9.81635H3.87672C3.87672 6.28617 6.74934 3.43488 10.2904 3.48013C13.6509 3.52539 16.4783 6.35859 16.5235 9.72584C16.5687 13.2651 13.7231 16.1526 10.2001 16.1526C9.07093 16.1526 8.01402 15.8448 7.09261 15.3289C6.74031 15.1297 6.30671 15.2021 6.02667 15.4918C5.61114 15.9082 5.69244 16.6233 6.20734 16.9129C7.39072 17.5737 8.74573 17.9629 10.2001 17.9629C14.762 17.9629 18.4566 14.1883 18.3302 9.58101C18.2127 5.33574 14.6716 1.78746 10.435 1.66979Z"></path>
          </svg>
        </div>
      </div>
      <div className="rn-card__content flex flex-col gap-2 p-2">
        {
          timeLogRootRemId &&
          <div className="gtd-time-log">
            <RemHierarchyEditorTree
              remId={ timeLogRootRemId }
              width="100%"
            ></RemHierarchyEditorTree>
          </div>
        }
      </div>
    </div>
  );
}

// const TaskInspector = () => {
//   const plugin = usePlugin();
//
//   const [timeLogHtml, setTimeLogHtml] = useState(<></>)
//
//   const updateTaskInspector = async (remId: RemId) => {
//     const openRem = (await plugin.rem.findOne(remId))!;
//     if (await isTaskRem(openRem)) {
//       const powerupMap = await getPowerupProperties(openRem, plugin);
//       if (powerupMap.has('Time Log')) {
//         const rem: Rem = powerupMap.get('Time Log');
//         const timeLog = await plugin.richText.toString(rem.backText!);
//         const regTimeLog = /\[(?<time>\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{1,2}:\d{1,2} (?:AM|PM))\]\s*(?<fromStatus>\w*)\s*(?:→\s*(?<toStatus>\w*))?/;
//         const _timeLogHtml: JSX.Element[] = [];
//         for (const row of timeLog.split('\n')) {
//           const matchTimeLog = regTimeLog.exec(row);
//           if (matchTimeLog) {
//             const { time, fromStatus, toStatus } = matchTimeLog.groups!;
//             const _li: JSX.Element[] = [];
//             _li.push(<span style={{ color: 'gray' }}>[{ time }] </span>);
//             _li.push(status2colorfulHtml(fromStatus));
//             if (toStatus) {
//               _li.push(<span>{ ' >>> ' }</span>)
//               _li.push(status2colorfulHtml(toStatus));
//             }
//             _timeLogHtml.push(<li>{ _li }</li>)
//           }
//         }
//         setTimeLogHtml(<ol className="gtd-log-row">{ _timeLogHtml }</ol> );
//       }
//     }
//   }
//
//   // plugin.event.addListener(
//   //   AppEvents.GlobalOpenRem,
//   //   undefined,
//   //   async ({ remId }) => {
//   //     await updateTaskInspector(remId);
//   //   });
//
//   useEffect(() => {
//     const asyncFunc = async () => {
//       const focusedPaneId = await plugin.window.getFocusedPaneId();
//       const openRemId = await plugin.window.getOpenPaneRemId(focusedPaneId);
//       await updateTaskInspector(openRemId!);
//     };
//
//     asyncFunc().then().catch(console.error);
//   })
//
//   return (
//     <div className="rn-plugin rn-card flex flex-col mb-2 bg-white">
//       <div
//         className="rn-card__header flex items-center flex-shrink-0 gap-2 p-2 text-lg font-semibold"
//         style={{ display: 'inline-block' }}
//       >Task Inspector</div>
//       <div className="rn-card__content flex flex-col gap-2 p-2">
//         { timeLogHtml }
//       </div>
//     </div>
//   );
// }

const decHms = (hms: number[]) => {
  if (hms[2] > 0) return [hms[0], hms[1], hms[2] - 1];
  else if (hms[1] > 0) return [hms[0], hms[1] - 1, 59];
  else if (hms[2] > 0) return [hms[0] - 1, 59, 59];
  else throw Error('Invalid hms ' + hms);
}

// const status2colorfulHtml = (status: string) => {
//   switch (status) {
//     case 'Scheduled': return <span>Scheduled</span>;
//     case 'Ready':     return <span style={{ color: 'blue' }}>Ready</span>;
//     case 'Now':       return <span style={{ color: 'red' }}>Now</span>;
//     case 'Done':      return <span style={{ color: 'green' }}>Done</span>;
//     case 'Cancelled': return <span>Cancelled</span>;
//   }
//   return <></>
// }

renderWidget(SideBarWidget);