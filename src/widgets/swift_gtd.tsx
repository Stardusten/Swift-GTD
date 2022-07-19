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

// // TODO Too ugly!!!!
// const Pomodoro = () => {
//   // TODO try remove any below
//   const plugin = usePlugin();
//
//   // rest time of active timer. if no timer is active, then [0, 0, 0]
//   const [restTime, setRestTime] = useState([0, 0, 0]);
//   // for sync update
//   const restSecsRef = useRef(restTime);
//
//   // The active timer's id. if no timer is active, then null.
//   const [activeTimerId, setActiveTimerId]: [any, SetStateAction<any>] = useState();
//
//   // Count down string, specified by usr
//   const [cdStr, setCdStr] = useState('');
//
//   // which task (rem) the active timer for
//   const [taskRemId, setTaskRemId]: [any, SetStateAction<any>] = useState();
//
//   useEffect(() => {
//
//     // check if there's an unfinished task
//     plugin.storage.getSynced('activeTimer')
//       .then((result) => {
//         if (result) {
//           const [finishTime, _taskRemId] = result;
//           setTaskRemId(_taskRemId);
//           const restAllSecs = (finishTime - new Date().valueOf()) / 1000;
//           if (restAllSecs > 0) {
//             const restHours = Math.floor(restAllSecs / 3600);
//             const restMins = Math.floor((restAllSecs - restHours * 3600) / 60);
//             const restSecs = restAllSecs % 60;
//             setRestTime([restHours, restMins, restSecs]);
//             restSecsRef.current = [restHours, restMins, restSecs];
//             // restart timer
//             const timerId = setInterval(async () => {
//               if (JSON.stringify(restSecsRef.current) == JSON.stringify([0, 0, 0])) {
//                 // reset timer
//                 clearInterval(timerId);
//                 // inform others that timer of this task is finished
//                 await plugin.messaging.broadcast(`pomodoro:finish:${taskRemId}`);
//                 // clear saved timer
//                 await plugin.storage.setSynced('activeTimer', null);
//               } else setRestTime(prev => decHMS(prev));
//             }, 1000);
//           } else {
//             // reset timer
//             clearInterval(activeTimerId);
//           }
//         }
//       })
//       .catch(console.error);
//
//     restSecsRef.current = restTime;
//   });
//
//   // TODO Ugly!!!
//   // when receive message like "ap:<remId>", start a new pomodoro for this rem (check task before).
//   // show its rem below, and user can navigate to the task rem easily.
//   useRunAsync(async () => {
//     await plugin.event.addListener(
//       AppEvents.MessageBroadcast,
//       undefined,
//       async ({ message }) => {
//         const regMessage = /pomodoro:active:(.*)/;
//         const matchArr = regMessage.exec(message);
//         if (!matchArr)
//           return;
//
//         // let active rem display at the pomodoro UI
//         setTaskRemId(matchArr[1]);
//
//         // check if cdStr is legal
//         const regCd = /^\s*(?:(?<h>\d*)h)?\s*(?:(?<min>\d*)min)?\s*(?:(?<s>\d*)s)?\s*$/;
//         const match = regCd.exec(cdStr);
//         if (!match) {
//           await plugin.app.toast('Invalid count down format.');
//           return;
//         }
//         // extract hours, minutes, seconds
//         const h = match.groups!.h ? parseInt(match.groups!.h) : 0;
//         const min = match.groups!.min ? parseInt(match.groups!.min) : 0;
//         const s = match.groups!.s ? parseInt(match.groups!.s) : 0;
//
//         setRestTime([h, min, s]);
//         restSecsRef.current = [h, min, s];
//         // save [finish time, remId of active taskrem] to synced storage
//         // so that we can restart it later.
//         await plugin.storage.setSynced('activeTimer', [addHMSToDate(new Date(), [h, min, s]), taskRemId]);
//         // start timer
//         const timerId = setInterval(async () => {
//           if (JSON.stringify(restSecsRef.current) == JSON.stringify([0, 0,  0])) {
//             // reset timer
//             clearInterval(timerId);
//             // inform others that timer of this task is finished
//             await plugin.messaging.broadcast(`pomodoro:finish:${taskRemId}`);
//             // clear saved timer
//             await plugin.storage.setSynced('activeTimer', null);
//           }
//           else setRestTime(prev => decHMS(prev));
//         }, 1000);
//
//         // record timer id
//         setActiveTimerId(timerId);
//     });
//   }, []);
//
//   return <div>
//     <div>{ `${restTime[0]}h ${restTime[1]}min ${restTime[2]}s` }</div>
//     <input value={ cdStr }
//            onChange={ (e) => setCdStr(e.target.value)}
//            placeholder={'e.g. 2h13min'}
//     />
//     <div
//       onClick={async () => {
//         if (activeTimerId) {
//           clearInterval(activeTimerId);
//           setActiveTimerId(-1); // clear active timerId
//           setRestTime([0, 0, 0]); // reset restSecs
//           await plugin.app.toast('Clear active timer successfully.');
//         } else {
//           await plugin.app.toast('No active timer.');
//         }
//       }}
//     >Cancel</div>
//     <RemHierarchyEditorTree
//       width={ 350 }
//       remId={ taskRemId }></RemHierarchyEditorTree>
//   </div>
// }
//
//
// /**
//  * Get `hms[0]h hms[1]min hms[2]s` later from `date`
//  */
// const addHMSToDate = (date: Date, hms: number[]) => {
//   const incSecs = 3600 * hms[0] + 60 * hms[1] + hms[2];
//   const incDate = new Date(incSecs * 1000);
//   return date.valueOf() + incDate.valueOf();
// }

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
    // not finished
    if (JSON.stringify(restHms) != JSON.stringify([0, 0, 0])) {
      const id = setTimeout(() => {
        setRestHms((prev) => decHms(prev));
      }, 1000);
      setTimerId(id);
    } else if (taskRemId) { // finished
      setTimerId(undefined);
      // notify all listeners that this pomodoro has finished
      // plugin.messaging.broadcast(`pomodoro:finished:${taskRemId}`).then().catch(console.error);
      plugin.messaging.broadcast(`task:${taskRemId}:Now:Ready`).then().catch(console.error);
    }
  }, [restHms]);

  useEffect(() => {
    plugin.event.addListener(
      AppEvents.MessageBroadcast,
      undefined,
      async ({ message }) => {

        const regMessage = /pomodoro:active:(?<remId>.*)/;
        const matchMessage = regMessage.exec(message);
        if (!matchMessage)
          return;

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
      });
  }, []);

  return (
    <div>
      <h2 className={ 'grow' }>Pomodoro</h2>
      <div>{ `${restHms[0]}h ${restHms[1]}min ${restHms[2]}s` }</div>
      <input
        value={ cdStr }
        onChange={ (e) => setCdStr(e.target.value) }
        placeholder={'e.g. 2h13min'}
      />
      <div
        onClick={ async () => {
          clearTimeout(timerId);
          // reset restHms
          setRestHms([0, 0, 0]);
          setTimerId(undefined);
          // notify all listeners that this pomodoro is cancelled
          // plugin.messaging.broadcast(`pomodoro:cancelled:${taskRemId}`).then().catch(console.error);
          plugin.messaging.broadcast(`task:${taskRemId}:Now:Ready`).then().catch(console.error);
        }}
      >Cancel</div>
      {/*<RemHierarchyEditorTree remId={ taskRemId }></RemHierarchyEditorTree>*/}
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