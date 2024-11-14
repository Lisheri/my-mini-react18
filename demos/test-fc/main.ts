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
