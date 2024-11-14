# react 并发更新

## 当前设计实现如何驱动的?(异步调度, 非并发更新)

1. 交互触发更新
2. 调度阶段微任务调度( ensureRootIsScheduled 方法)
3. 微任务调度结束, 进入 render 阶段
4. render 阶段结束, 进入 commit 阶段
5. commit 阶段结束, 重新进入调度阶段微任务调度(ensureRootIsScheduled 方法)`(对应1)`

整体是一个大的微任务循环, 不停的消耗产生的 Update, 循环的驱动力是「微任务调度模块」

## demo 示例

```ts
import './style.css';
// 更新demo
const button = document.querySelector('button');
const root = document.querySelector('#root');

// 这里交互会产生一个work
interface Work {
	// 代表一个工作要执行的次数, 类比react组件的数量
	// 在render阶段, react的工作就是对每个组件执行 beginWork和completeWork
	// 如果将beginWork和completeWork看成是一个工作单元, 那么组件有多少, 就要执行多少次, 因此这里直接利用count来类比
	count: number;
}

// 这里的workList就是一个全局的工作队列, 用来存储所有的工作
const workList: Work[] = [];

// 调度出work, 交给 perform(类比beginWork -> completeWork流程)
function schedule() {
	// 3. 微任务结束
	const curWork = workList.pop();
	if (curWork) {
		perform(curWork);
	}
}

function perform(work: Work) {
	// 4. 类似render和commit阶段
	while (work.count) {
		// 类似执行更新操作
		work.count--;
		insertSpan(work.count + ' ');
	}
	// 5. 继续调度
	schedule();
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	root?.appendChild(span);
}

button &&
	(button.onclick = () => {
		// 1. 交互触发更新, 产生一个work
		workList.unshift({ count: 100 });
		// 类似触发更新执行调度流程
		// 2. 调度更新流程
		schedule();
	});
```

### 缺点

上述流程存在两个情况会造成阻塞

- work.count 数量太多(上述操作, 改成 1000000 直接卡死)
- 单个 work.count 的工作量太大(假如并不是如实例一样单纯的--, 而是存在非常多的同步操作)

### react 解决上述问题

> 使用的是时间切片功能

## 改造 demo

如果想在宏任务中完成任务调度, 本质上是一个很大的宏任务循环, 循环驱动力是 Scheduler

在微任务调度中, 没有 「优先级」 概念

对于 Scheduler 存在 5 种优先级

- ImmediatePriority
- UserBlockingPriority
- NormalPriority
- LowPriority
- IdlePriority
