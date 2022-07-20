import {
  AppEvents, RemHierarchyEditorTree,
  renderWidget,
  RichText,
  usePlugin,
  useRunAsync,
  useSessionStorageState,
  useTracker,
} from '@remnote/plugin-sdk';
import { SetStateAction, useEffect, useRef, useState } from 'react';

const SwiftGtdWidget = () => {
  return <Pomodoro></Pomodoro>;
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

  // try to recover unfinish timer
  useEffect(() => {
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
      // plugin.messaging.broadcast(`pomodoro:finished:${taskRemId}`).then().catch(console.error);
      plugin.messaging.broadcast(`task:${taskRemId}:Now:Ready`).then().catch(console.error);
    }
  }, [restHms]);

  // handle new pomodoro request
  useEffect(() => {

    plugin.event.addListener(
      AppEvents.MessageBroadcast,
      undefined,
      async ({ message }) => {

        const regMessage = /pomodoro:active:(?<remId>.*)/;
        const matchMessage = regMessage.exec(message);
        if (!matchMessage)
          return;

        const unfinishedPomodoro = await plugin.storage.getSynced('unfinishedPomodoro');
        if (unfinishedPomodoro) {
          console.log(JSON.stringify(unfinishedPomodoro));
          await plugin.app.toast('You cannot do two pomodoro at the same time!');
          return;
        }

        const _taskRemId = matchMessage.groups!.remId
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
        plugin.messaging.broadcast(`task:${_taskRemId}::Now`).then().catch(console.error);

        // save to synced storage
        const finishTime = new Date(new Date().getTime() + (3600 * h + 60 * min + s) * 1000);
        await plugin.storage.setSynced('unfinishedPomodoro', [finishTime, _taskRemId]);
      });
  }, []);

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
      <div className="rn-plugin rn-card flex flex-col mb-2 bg-white">
        <div
          className="rn-card__header flex items-center flex-shrink-0 gap-2 p-2 text-lg font-semibold"
          style={{ display: 'inline-block' }}
        >Pomodoro</div>
        <div className="rn-card__content flex flex-col gap-2 p-2">
          <div
            className="font-mono"
            style={{
              textAlign: 'center',
              fontSize: '2em',
              fontWeight: '600',
            }}
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
              style={{
                backgroundColor: '#f4f4fa',
                padding: '0.5em 1em',
                border: '0.2em',
                borderRadius: '5px',
                width: '75%',
                marginRight: '1em',
              }}
              value={ cdStr }
              onChange={ (e) => setCdStr(e.target.value) }
              placeholder={'Type cd here: e.g. 2h13min'}
            />
            <div
              style={{
                backgroundColor: '#f4f4fa',
                padding: '0.5em 0',
                border: '0.2em',
                borderRadius: '5px',
                width: '25%',
                textAlign: 'center',
                color: '#9CA3AF',
              }}
              onClick={ async () => {
                clearTimeout(timerId);
                // reset restHms
                setRestHms([0, 0, 0]);
                setTimerId(null);
                await plugin.storage.setSynced('unfinishedPomodoro', null);
                // notify all listeners that this pomodoro is cancelled
                // plugin.messaging.broadcast(`pomodoro:cancelled:${taskRemId}`).then().catch(console.error);
                plugin.messaging.broadcast(`task:${taskRemId}:Now:Ready`).then().catch(console.error);
              }}
            >Cancel</div>
          </div>
          {/*<RemHierarchyEditorTree*/}
          {/*  remId={ taskRemId }*/}
          {/*  width={ '100%' }*/}
          {/*></RemHierarchyEditorTree>*/}
        </div>
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

renderWidget(SwiftGtdWidget);