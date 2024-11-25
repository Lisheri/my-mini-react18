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

## 改造后的 demo

```ts
import {
	unstable_ImmediatePriority as ImmediatePriority, // 对应同步更新
	unstable_UserBlockingPriority as UserBlockingPriority, // 对应事件
	unstable_NormalPriority as NormalPriority, // 正常的优先级
	unstable_LowPriority as LowPriority, // 低优先级
	unstable_IdlePriority as IdlePriority, // 空闲优先级
	unstable_scheduleCallback as scheduleCallback,
	unstable_shouldYield as shouldYield, // 告诉外部当前时间切片是否用尽
	type CallbackNode, // 调度函数类型
	unstable_getFirstCallbackNode as getFirstCallbackNode,
	unstable_cancelCallback as cancelCallback
} from 'scheduler';
import './style.css';
// 更新demo
// const button = document.querySelector('button');
const root = document.querySelector('#root')!;

type Priority =
	| typeof IdlePriority
	| typeof LowPriority
	| typeof NormalPriority
	| typeof UserBlockingPriority
	| typeof ImmediatePriority;

// 这里交互会产生一个work
interface Work {
	// 代表一个工作要执行的次数, 类比react组件的数量
	// 在render阶段, react的工作就是对每个组件执行 beginWork和completeWork
	// 如果将beginWork和completeWork看成是一个工作单元, 那么组件有多少, 就要执行多少次, 因此这里直接利用count来类比
	count: number;
	// 优先级
	priority: Priority;
}

// 这里的workList就是一个全局的工作队列, 用来存储所有的工作
const workList: Work[] = [];

// 创建按钮
[LowPriority, NormalPriority, UserBlockingPriority, ImmediatePriority].forEach(
	(priority) => {
		const button = document.createElement('button');
		button.innerText = ['', 'Immediate', 'UserBlocking', 'Normal', 'Low'][
			priority
		];

		root.appendChild(button);
		button.onclick = () => {
			workList.unshift({ count: 100, priority: priority as Priority });
			schedule();
		};
	}
);

let prevPriority: Priority = IdlePriority;
let curCallback: CallbackNode | null;
// 调度出work, 交给 perform(类比beginWork -> completeWork流程)
function schedule() {
	// 获取当前正在调度的回调
	const callbackNode = getFirstCallbackNode();
	// 3. 微任务结束
	const curWork: Work = workList.sort((w1, w2) => w1.priority - w2.priority)[0];
	// 策略逻辑
	if (!curWork) {
		curCallback = null;
		// 如果当前work已经空了, 说明其实所有的调度都已经结束了, 即便是还拿到了一个callback, 也需要取消
		// 即使继续往后调度回调, 也没有意义
		callbackNode && cancelCallback(callbackNode);
		return;
	}
	const { priority: curPriority } = curWork;
	if (curPriority === prevPriority) {
		return;
	}
	// 到这里的一定是优先级更高的work
	// 先取消之前的调度(因为优先级低)
	callbackNode && cancelCallback(callbackNode);
	// 接着调度新的
	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

function perform(work: Work, didTimeout?: boolean) {
	// 4. 类似render和commit阶段
	// 这里需要可中断
	// 否则就会出现这里的逻辑执行时间 大于了浏览器的刷新率, 比如说 60hz 是16ms
	// 那么一旦这里单个count耗时1ms, 一共有100个, 那么就需要 100ms, 这里就会存在一个明显的掉帧

	// 但如果每执行15个任务, 就切断一次, 切成了 7个短的宏任务, 每一个都是小于16ms的, 那么在 15ms和 15ms中间就存在浏览器的渲染时机, 减少掉帧的可能性

	/**
	 * 影响中断的情况
	 * 1. work.priority 优先级, 比如说同步优先级, 那么他很紧迫, 是不能被中断的
	 * 2. 饥饿问题, 比如有一个work的优先级, 比较低, 导致他一直竞争不过其他work, 那么他就会一直被中断, 也就是饥饿问题
	 *    在scheduler内部, 如果一个work一直被跳过, 那么他的优先级会越来越高, 用于处理饥饿问题(最终会过期, 过期后就变成了同步任务)
	 *    在schedulerCallback调度perform时, 会传递一个参数叫做 ditTimeout, 如果为true, 那么代表过期
	 * 3. 时间切片, 当前时间切片已经用完了, 必须停下来, 让浏览器处理交互和更新
	 */
	// 同步任务或者已经过期, 都需要同步执行
	const needSync = work.priority === ImmediatePriority || didTimeout;
	// 当前是同步任务, 或者时间切片还有空余, 并且当前work的组件还没有处理完, 这种情况下才会继续进入while循环
	while ((needSync || !shouldYield()) && work.count) {
		// 类似执行更新操作
		work.count--;
		insertSpan(work.priority + '');
	}
	// 到这里, 一个是执行完了, 还有一个是被中断了
	// 记录上一次的优先级
	prevPriority = work.priority;
	if (!work.count) {
		const workIdx = workList.indexOf(work);
		// 移除当前work
		workList.splice(workIdx, 1);
		// 处理完了, 重置
		prevPriority = IdlePriority;
	}
	// 5. 继续调度

	// 如果仅有一个work, scheduler有一个优化路径: 如果调度的回调函数的返回值是函数, 则会继续调度返回的函数
	// 如果工作过程中产生了一个相同优先级的work, 则不需要开启新的调度
	// 工作过程中产生了更高/更低优先级的work, 直接交给优先级调度, 每次选出来的都是最高的
	const prevCallback = curCallback;
	schedule();
	const newCallback = curCallback;
	if (newCallback && prevCallback === newCallback) {
		// 这里代表在schedule中, 新的work优先级和上一次的一致
		// 也就代表接下来应该被调度的work, 和上一次是一样的
		return perform.bind(null, work);
	}
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	span.className = `pri-${content}`;
	doSomeBusyWork(10000000);
	root?.appendChild(span);
}

// button &&
// 	(button.onclick = () => {
// 		// 1. 交互触发更新, 产生一个work
// 		workList.unshift({ count: 1000 });
// 		// 类似触发更新执行调度流程
// 		// 2. 调度更新流程
// 		schedule();
// 	});

// 纯消耗时间
function doSomeBusyWork(len: number) {
	let res = 0;
	while (len--) {
		res += len;
	}
	return res;
}
```

## 现有版本需要支持并发更新, 需要做如下改造:

- Lane 模型需要增加更多的优先级
- 交互需要和优先级对应
- 调度阶段引入 Scheduler, 新增调度策略逻辑
- render 阶段可中断
- 根据 update 计算 state 的算法需要修改
  - 当前优先级只有 syncLane, 因此他不存在被跳过的情况, 需要支持他被跳过

## 扩展交互

### 优先级从哪里来?

> 应该是不同交互对应不同优先级
> 比如说输入框输入, 弹出下拉框等, 他们的优先级应该是不同的(在用户的感知中, 输入文字优先级一定是高于搜索结果框弹出的)

可以根据「触发更新的上下文环境」赋予不同优先级。

比如:

- 点击事件需要同步处理
- 滚动事件优先级再低点
  ...

上述结论更进一步, 可以推广到任何「可以触发更新的上下文环境」, 比如:

- useEffect create 回调中触发更新的优先级
- 首屏渲染的优先级

### 下一个问题: 这些优先级的改动是如何影响更新的？

> 只要优先级能影响 update, 就能影响更新

Update 的优先级来自于 `RequestUpdateLanes`, 对应的位置一个函数组件调用`setState`触发更新, 还有一个是在首屏渲染调用`updateContainer`的时候

当前我们可以拿到的优先级信息有如下两种：

1. React 的 Lane 模型
2. 调度器产生的 5 种优先级

也就是说, 运行流程在 React 时, 使用的是 Lane 模型, 运行流程在 Scheduler 时, 使用的是优先级。

因此需要实现一个方法, 用于转换上述的两种优先级

- laneToSchedulerPriority
- schedulerPriorityToLane

## 扩展调度阶段

主要是在同步更新(微任务调度)的技术侧行扩展并发更新(scheduler 调度), 主要包括

- 将 demo 中的调度策略移到项目中
- render 阶段变为「可中断」

梳理两种典型场景:

- 时间切片
- 高优先级更新打断低优先级更新

## 扩展 state 计算机制

扩展「根据 lane 对应 update 计算 state 的机制」, 主要包括：

- 通过 update 计算 state 时可以跳过「优先级不够的 update」
- 由于「高优先级任务打断低优先级任务」, 同一个组件中「根据 update 计算 state」的流程可能会多次执行, 所以需要保存 update

### 跳过 update 需要考虑问题

如何比较「优先级是否足够」?
lane 数值大小的直接不叫不够灵活。
如何同时兼顾『update 的连续性』与『update 的优先级』?

```ts
// 假设有如下三个update
// u0
{
  action: num => num + 1,
  lane: DefaultLane
}

// u1
{
  action: 31,
  lane: SyncLane
}

// u2
{
  action: num => num + 10,
  lane: DefaultLane
}
```

对于上述三个 update

只考虑优先级的情况下, 结果是: 11
只考虑连续性的情况下, 结果是: 13

### 兼顾『update 的连续性』与『update 的优先级』

为了达到上述兼顾「连续性」以及「优先级」的目的, 需要新增两个字段

新增 baseState, baseQueue 字段:

> 同时需要遵循如下 5 个原则

- baseState 是本次更新参与计算的初始 state, memoizedState 是上次更新计算的最终 state
- 如果本次更新没有 update 被跳过, 则下次更新开始时 baseState === memoizedState
- 如果本次更新有 update 被跳过, 则本次更新计算出 memoizedState 为「考虑优先级」情况下计算的结果, baseState 为「最后一个没被跳过的 update 计算后的结果」, 下次更新开始事 baseState !== memoizedState
- 本次更新「被跳过的 update 及其后面的所有 update」都会被保存在 baseQueue 中参与下次 state 计算
- 本次更新「参与计算但保存在 baseQueue 中的 update」, 优先级会降低到 NoLane

以上述 demo 为例, 还是如下 3 个 update

```ts
// 假设有如下三个update
// u0
{
  action: num => num + 1,
  lane: DefaultLane
}

// u1
{
  action: 3,
  lane: SyncLane
}

// u2
{
  action: num => num + 10,
  lane: DefaultLane
}

/*
  引入baseQueue后, 每一次update的来源就变成了 baseQueue与pendingUpdate合并之后的结果
  第一次render
  baseState = 0; memoizedState = 0;
  baseQueue = null; updateLane = DefaultLane
  第一次render 第一次计算
  baseState = 1; memoizedState = 1;
  baseQueue = null;
  第一次render 第二次计算 (u1被跳过)
  baseState = 1; memoizedState = 1;
  baseQueue = u1;
  第一次render 第三次计算
  baseState = 1; memoizedState = 11;
  baseQueue = u1 -> u2(NoLane)

  baseState为最后一个没有被跳过的update计算的结果, 也就是u0, 因此baseState不变, 还是1
  而u2之所以进入 baseQueue是因为「被跳过的update以及后面的所有update」都会被保存在baseQueue中, 同时参与计算但是被保存在baseQueue中的update优先级会降低到NoLane
  而这也代表了u2一定会参与下一次优先级的计算(因为NoLane和任何其他的Lane相交的结果都是NoLane「isSubsetOfLanes(set, NoLane)一定是true」, 因此一定会参与计算)
*/

/*
  第二次render
  baseState = 1; memoizedState = 11;
  baseQueue = u1 -> u2(NoLane); updateLane = SyncLane
  第一次计算
  baseState = 3; memoizedState = 3;(计算的是SyncLane, 因此u1一定是满足的)
  第二次计算
  baseState = 13; memoizedState = 13;
*/
```

根据上述 demo, 可以知道, 是没有办法在一次计算中同时兼顾「连续性」和「优先级」的, 但是可以分多次来进行, 这样就可以兼顾这两个原则了

同时每次计算都可以兼顾到优先级, 并且总体来看, 也可以兼顾连续性

因此对于 react 来说, 他只能保证每一次最终的状态是符合预期的, 但是可能会产生不符合预期的中间状态

这些中间状态的产生均是因为只考虑了连续性没有考虑优先级


