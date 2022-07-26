# Swift GTD

一个给 RemNote 用的 GTD 插件。

## Tasks and Status 任务及其状态

There are five states of a task as follows:

任务共有以下五种状态：

- Scheduled
- Ready
- Now
- Done
- Cancelled

The state transition logic is as follows:

状态转换逻辑如下：

- Add a task and automatically toggle to the **Scheduled** state.
- A task is ready to be done (on the schedule), toggle it to **Ready** state.
- The ongoing task now should be in the **Now** state (only one task is allowed to be in the **Now** state).
- Finish a task and toggle to **Done** state.
- Give up a task and toggle to **Cancelled** state.


- 添加一个任务，自动转换到 Scheduled 状态。
- 准备处理一个任务（提上日程），将其转换到 Ready 状态。
- 现在手头正在做的任务应为 Now 状态（只允许有一个任务处于 Now 状态）。
- 完成一个任务，转换到 Done 状态。
- 放弃一个任务，转换到 Cancelled 状态。

有两种方法手动转换任务状态：

- 使用指令（通过 Omnibar 或斜杠菜单触发，命名规则为 “Toogle + 要转换到的状态名”）。
- 使用右侧栏面板中 Quick Access 下面的按钮。

右侧栏面板中 Task Overview 项下，会列出当前处于 Now，Ready 和 Scheduled 状态的所有任务，点击任务项即可跳转到其所在的 rem。

## Time Log

Swift-GTD will tracks each task status transition and automatically generates a timelog (as shown in the image below).

Swift-GTD 会追踪每个任务的状态变化，并自动生成 timelog（如下图所示）

You can attach a message to a timelog using *card syntax*. 

使用制卡语法，可以为一条 timelog 附上一条信息。

可在右侧栏面板快速查看一个任务的 timelogs：

## Subtasks and Progress Bars 子任务与进度条

When adding / removing a subtask or toggle the status of a subtask, the progress bar of its parent task will be added / deleted / updated automatically.

当添加 / 删除子任务和更改子任务的状态时，会自动为父任务添加 / 删除 / 更新进度条。

注意：目前此插件无法捕捉不经由插件提供的指令（如上面的 new task 指令等）产生的任务树更改。

比如：如果将某个子任务所在 rem 反缩进一级，则这个任务就不属于其原来的父任务了。但插件无法捕捉这一事件，也不会自动更新父任务的进度条。

当出现这种情况导致的进度条错误时，可以使用 Update Focused Rem Tree Prgerss 指令强制扫描当前 rem 所在 rem 树，修正进度条。

进度条样式可在插件设置中更改。

如果某个任务打上了 Automatically Done 标签，则当其所有子任务完成时，父任务会自动转换至完成状态。

## 番茄钟


点击右侧栏中飞镖即可打开番茄钟组件。输入番茄钟的时间，然后在想要完成的任务上使用 Start Pomodoro 指令即可启动一个番茄钟。

番茄钟的时间使用 x h x min xs 格式指定，下面的输入都是合法的：

- 10min 20s
- 1h
- 1h10min7s
- 10 s

启动番茄钟会使对应任务切换到 Now 状态，番茄钟完成后切换到 Ready 状态。自动状态的切换和手工切换一样，会记录到 Time Log 属性中。

一个未完成的番茄钟不会因为关掉 remnote 标签页 / 应用而丢失。在再次启动时，将会自动检测是否存在之前未完成的番茄钟，如果有，则继续。
