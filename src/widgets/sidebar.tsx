import {
  AppEvents, Rem, RemHierarchyEditorTree, RemId, RemRichTextEditor, RemViewer,
  renderWidget,
  RichText, RNPlugin,
  usePlugin,
  useRunAsync,
  useSessionStorageState,
  useTracker,
} from '@remnote/plugin-sdk';
import { SetStateAction, useEffect, useRef, useState } from 'react';
import { getPowerupProperties, isTaskRem, newTask, prevCheck, toggleTaskStatus } from '../utils/gtd';
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
      {/*<TaskInspector></TaskInspector>*/}
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
            // notify all listeners that this pomodoro is cancelled
            // plugin.messaging.broadcast(`pomodoro:cancelled:${taskRemId}`).then().catch(console.error);
            // plugin.messaging.broadcast(`task:${taskRemId}:Now:Ready`).then().catch(console.error);
            plugin.messaging.broadcast({
              type: 'task',
              remId: taskRemId,
              fromStatus: 'Now',
              toStatus: 'Ready'
            }).then().catch(console.error);
          }}
          onInactiveClick={ async () => {
            await prevCheck(
              plugin,
              async (plugin: RNPlugin, focusedRem: Rem) => {
                // await plugin.messaging.broadcast(`pomodoro:active:${focusedRem._id}`);
                await plugin.messaging.broadcast({
                  type: 'pomodoroActive',
                  remId: focusedRem._id,
                })
            });
          }}
        ></PomodoroButton>
        </div>
        {/*<FocusedTask></FocusedTask>*/}
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

/**
 * XXX Won't update reactively!!! deprecated for now.
 * @constructor
 */
const FocusedTask = () => {

  const focusedRemId = useTracker(async (plugin) => {
    return await plugin.focus.getFocusedRemId();
  });

  return <RemHierarchyEditorTree width={ '100%' } remId={ focusedRemId }></RemHierarchyEditorTree>;
}

const TaskInspector = () => {
  const plugin = usePlugin();

  const [timeLogHtml, setTimeLogHtml] = useState(<></>)

  const updateTaskInspector = async (remId: RemId) => {
    const openRem = (await plugin.rem.findOne(remId))!;
    if (await isTaskRem(openRem)) {
      const powerupMap = await getPowerupProperties(openRem, plugin);
      if (powerupMap.has('Time Log')) {
        const rem: Rem = powerupMap.get('Time Log');
        const timeLog = await plugin.richText.toString(rem.backText!);
        const regTimeLog = /\[(?<time>\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{1,2}:\d{1,2} (?:AM|PM))\]\s*(?<fromStatus>\w*)\s*(?:→\s*(?<toStatus>\w*))?/;
        const _timeLogHtml: JSX.Element[] = [];
        for (const row of timeLog.split('\n')) {
          const matchTimeLog = regTimeLog.exec(row);
          if (matchTimeLog) {
            const { time, fromStatus, toStatus } = matchTimeLog.groups!;
            const _li: JSX.Element[] = [];
            _li.push(<span style={{ color: 'gray' }}>[{ time }] </span>);
            _li.push(status2colorfulHtml(fromStatus));
            if (toStatus) {
              _li.push(<span>{ ' >>> ' }</span>)
              _li.push(status2colorfulHtml(toStatus));
            }
            _timeLogHtml.push(<li>{ _li }</li>)
          }
        }
        setTimeLogHtml(<ol className="gtd-log-row">{ _timeLogHtml }</ol> );
      }
    }
  }

  // plugin.event.addListener(
  //   AppEvents.GlobalOpenRem,
  //   undefined,
  //   async ({ remId }) => {
  //     await updateTaskInspector(remId);
  //   });

  useEffect(() => {
    const asyncFunc = async () => {
      const focusedPaneId = await plugin.window.getFocusedPaneId();
      const openRemId = await plugin.window.getOpenPaneRemId(focusedPaneId);
      await updateTaskInspector(openRemId!);
    };

    asyncFunc().then().catch(console.error);
  })

  return (
    <div className="rn-plugin rn-card flex flex-col mb-2 bg-white">
      <div
        className="rn-card__header flex items-center flex-shrink-0 gap-2 p-2 text-lg font-semibold"
        style={{ display: 'inline-block' }}
      >Task Inspector</div>
      <div className="rn-card__content flex flex-col gap-2 p-2">
        { timeLogHtml }
      </div>
    </div>
  );
}

const decHms = (hms: number[]) => {
  if (hms[2] > 0) return [hms[0], hms[1], hms[2] - 1];
  else if (hms[1] > 0) return [hms[0], hms[1] - 1, 59];
  else if (hms[2] > 0) return [hms[0] - 1, 59, 59];
  else throw Error('Invalid hms ' + hms);
}

const status2colorfulHtml = (status: string) => {
  switch (status) {
    case 'Scheduled': return <span>Scheduled</span>;
    case 'Ready':     return <span style={{ color: 'blue' }}>Ready</span>;
    case 'Now':       return <span style={{ color: 'red' }}>Now</span>;
    case 'Done':      return <span style={{ color: 'green' }}>Done</span>;
    case 'Cancelled': return <span>Cancelled</span>;
  }
  return <></>
}

renderWidget(SideBarWidget);