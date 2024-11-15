import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	createWorkInProgress,
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	getHighestPriorityLane,
	Lane,
	lanesToSchedulerPriority,
	markRootFinished,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	// 调度回调函数
	unstable_scheduleCallback as scheduleCallback,
	// 优先级
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback,
	CallbackNode
	// unstable_IdlePriority
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';

// 全局指针指向正在工作的 fiberNode
let workInProgress: FiberNode | null;
let wipRootRenderLane: Lane = NoLane; // 本次更新时的lane
let rootDoesHasPassiveEffects = false; // 是否正在调度副作用

type RootExitStatus = number; // render阶段退出时的状态
const RootInComplete = 1; // 中断
const RootCompleted = 2; // 完成
// TODO 执行报错导致中断

// 存储上一次的优先级和当前回调函数
// let prevPriority: number = unstable_IdlePriority;
// let curCallback: CallbackNode | null;

// * 用于执行初始化的操作
function prepareRefreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	// FiberRootNode不是普通Fiber, 不能直接作为 workInProgress
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

// 用于连接 updateContainer与renderRoot
// ? 本质上是在fiber中调度update
// ? 在调用 React.createRoot的过程中, 首次触发 scheduleUpdateOnFiber, 传入的就是 hostRootFiber
// 增加lane, 确认优先级
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// TODO 调度功能
	// ? 对于入口来说, fiber是hostRootFiber, 但是对于其他的更新流程, 传入的fiber就是当前组件对应的fiber
	// ? 组件对应的 ComponentFiber 更新, 需要回到根节点, 再往下查找
	// ? 所以需要从当前fiber, 一直往上遍历到 FiberRootNode
	// ? 所以核心在于获取 FiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	// 然后从根节点开始更新流程
	// schedule阶段需要记录当前 lane 到 fiberRootNode中
	markRootUpdated(root as FiberRootNode, lane);
	// renderRoot(root as FiberRootNode);
	// 调度阶段入口
	ensureRootInScheduled(root as FiberRootNode);
}

// 保证root被调度, 作为调度阶段的入口
function ensureRootInScheduled(root: FiberRootNode) {
	// 1. 实现判断机制, 选出最高优先级的lane
	// 最右边的位就是优先级最高的lane
	const updateLane = getHighestPriorityLane(root.pendingLanes);

	// 获取当前正在调度的回调函数
	const existingCallbackNode = root.callbackNode;

	if (updateLane === NoLane) {
		// 代表没有lane
		// 代表没有work了
		if (existingCallbackNode !== null) {
			// 取消调度
			unstable_cancelCallback(existingCallbackNode);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;
	if (curPriority === prevPriority) {
		// 代表同优先级更新, 无需新的调度, 后面会判断中断继续调度
		return;
	}

	// ? 低优先级无法打断, 一定是高优先级才会往后
	// 如果是中断, 那么只有两个情况
	// 1. curPriority和之前一样, 那么直接返回, 让他继续调度即可
	// 2. curPriority更高(因为每次取的都是最右边的位, 因此一定代表插入了优先级更高的lane, 才会导致优先级发生变化, 因为这里是中断状态)
	if (existingCallbackNode !== null) {
		// 存在更高优先级更新, 取消之前的(之前的一定更低)
		unstable_cancelCallback(existingCallbackNode);
	}

	// 新的callbackNode
	let newCallbackNode: CallbackNode | null = null;

	if (updateLane === SyncLane) {
		// 同步优先级 用微任务调度
		if (__DEV__) {
			console.info('在微任务中调度 优先级是 ', updateLane);
		}
		// 调度的任务其实就是 renderRoot
		// 将同步阶段的调度函数加入队列
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		// 触发调度
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级, 用宏任务调度(类似Vue的框架均只有微任务调度, 没有宏任务调度的逻辑)
		// 宏任务调度是调度器调度
		const schedulerPriority = lanesToSchedulerPriority(updateLane);
		// 利用调度器调度回调函数
		newCallbackNode = scheduleCallback(schedulerPriority, () =>
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	// 2. 实现类似防抖、节流的效果, 合并微任务中触发的更新
	// TODO 宏任务合并
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
}

function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// 向上查找根fiber, 也就是fiberRootNode
function markUpdateFromFiberToRoot(fiber: FiberNode): FiberRootNode | null {
	let node = fiber;
	let parent = node.return;
	while (parent !== null) {
		// 从普通fiberNode往上查找
		node = parent;
		parent = node.return;
	}

	if (node.tag === HostRoot) {
		// hostRootFiber对应的tag为HostRoot
		// hostRootFiber是通过 stateNode指向fiberRootNode
		return node.stateNode;
	}
	// 说明没找到
	return null;
}

// 独立render阶段
function renderRoot(
	root: FiberRootNode,
	lane: Lane,
	shouldTimeSlice: boolean
): RootExitStatus {
	if (__DEV__) {
		console.info(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}

	// 并不是每次都要初始化, 如果优先级一样, 说明是中断恢复, 不需要重新初始化
	if (wipRootRenderLane !== lane) {
		// 1. 如果是中断时进入这里, 代表的是当前执行了一个更高优先级的调度, 导致lane发生了变化, 因此需要重新初始化
		// 初始化, 让 workInProgress 指向第一个遍历的FiberNode
		// ? 深度优先(先序遍历), 把root丢进去初始化
		prepareRefreshStack(root, lane);
	}
	// 如果没有重新初始化, 中断后回到这里, 那么 workInProgress 一定是之前的 workInProgress, 不会改变
	// 进入循环
	do {
		try {
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				// 仅开发环境打印
				console.error('workLoop发生错误:', e);
			}
			// 有报错就重置 workInProgress
			workInProgress = null;
		}
	} while (true);

	// 执行完了 || 中断
	if (shouldTimeSlice && workInProgress !== null) {
		// 正常中断
		return RootInComplete;
	}
	if (!shouldTimeSlice && workInProgress !== null) {
		console.error('render阶段结束wip不应该存在! 请检查错误!');
	}
	// TODO 处理报错中断
	return RootCompleted;
}

// renderRoot 主要用于开启更新
// 调用 renderRoot 应当是触发更新的API
// 修改 renderRoot为 performSyncWorkOnRoot, 用于区分后续并发更新时的 入口
// 当前是同步更新入口(不可中断)
function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);
	if (nextLane !== SyncLane) {
		// 1.其他比 syncLane低的优先级
		// 2.NoLane
		ensureRootInScheduled(root); // 这里面如果遇到其他更低优先级的调度, 则会重新调度
		return;
	}

	// 开始render阶段
	const exitStatus = renderRoot(root, nextLane, false);

	if (exitStatus === RootCompleted) {
		// 完成
		// workLoop完成后, 这里就可以得到一颗新创建的FiberNode Tree
		// ? 这棵树在 root.current.alternate 上
		// ? root是 fiberRootNode, 他的current指向 hostRootFiber
		// ? 他的 alternate 是整个更新开始时, 也就是在 prepareRefreshStack 中创建的 wip
		// ? 此时 wip 已经处理完成了
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane; // 保存本次更新消费过的lane
		// 本次更新结束, 恢复
		wipRootRenderLane = NoLane;
		// 根据 wip fiberNode 树中的flags执行首屏渲染操作
		// commit流程入口
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现的同步更细结束状态');
	}
}

// 并发更新工作入口(可中断)
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout?: boolean
): any {
	// 并发更新开始时, 需要保证之前的 useEffect回调都已经执行了
	/*
    比如存在一个 如下组件
    function App() {
      useEffect(() => {
        这里触发更新, 并且优先级很高, 高过了当前正在触发的更新
          setState(xxx)
      })
    }
  */
	// 执行了副作用可能会创建新的callback, 如果优先级更高的话, 因此需要暂存
	const curCallback = root.callbackNode;
	const didFlushPassiveEffects = flushPassiveEffects(
		root.pendingPassiveEffects
	);
	if (didFlushPassiveEffects) {
		if (root.callbackNode !== curCallback) {
			// 代表触发了更新, 并且更新的优先级高过了当前正在触发的更新
			// 因此当前的调度不应该继续执行了, 应该执行插入进来的高优先级调度
			return null;
		}
	}
	// 获取最高优先级的lane
	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return;
	}

	const needSync = lane === SyncLane || didTimeout;
	// render阶段
	const exitStatus = renderRoot(root, lane, !needSync); // ? 不是同步就是时间切片

	// 开启新的优先级调度
	ensureRootInScheduled(root);

	if (exitStatus === RootInComplete) {
		// 中断
		if (root.callbackNode !== curCallbackNode) {
			// 存在更高优先级的更新插入(上面重新开启了调度, 其中可能存在优先级更高的调度)
			return null;
		}
		// 继续调度当前回调函数
		return performConcurrentWorkOnRoot.bind(null, root);
	}
	if (exitStatus === RootCompleted) {
		// 完成
		// workLoop完成后, 这里就可以得到一颗新创建的FiberNode Tree
		// ? 这棵树在 root.current.alternate 上
		// ? root是 fiberRootNode, 他的current指向 hostRootFiber
		// ? 他的 alternate 是整个更新开始时, 也就是在 prepareRefreshStack 中创建的 wip
		// ? 此时 wip 已经处理完成了
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane; // 保存本次更新消费过的lane
		// 本次更新结束, 恢复
		wipRootRenderLane = NoLane;
		// 根据 wip fiberNode 树中的flags执行首屏渲染操作
		// commit流程入口
		commitRoot(root);
	} else if (__DEV__) {
		console.error('还未实现的并发更细结束状态');
	}
}

// 可以类比于git commit这个过程, 用于提交
// 就是将workLoop生成的产物提交到宿主环境
// 一共三个子阶段:
// + beforeMutation
// + mutation
// + layout
function commitRoot(root: FiberRootNode) {
	// 1. 暂存finishedWork
	const finishedWork = root.finishedWork;
	if (finishedWork === null) return;
	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}

	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane!');
	}

	// 2. 重置(此时已经暂存到了 finishedWork 中)
	root.finishedWork = null;
	root.finishedLane = NoLane;
	// 从root.pendingLanes中移除当前lane(当前lane已经处理完成)
	markRootFinished(root, lane);

	// 判断是否需要执行副作用
	// 和微任务调度类似, 调度useEffect也需要阻止多次调度
	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subTressFlags & PassiveMask) !== NoFlags
	) {
		// 当前fiber tree上存在副作用, 需要执行useEffect回调
		if (!rootDoesHasPassiveEffects) {
			rootDoesHasPassiveEffects = true;
			// 调度副作用
			// 调度一个回调函数, 此时需要确认一个优先级（回调函数的触发, 类似 setTimeout, 是一个异步的过程）
			scheduleCallback(NormalPriority, () => {
				// 执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 3. 判断是否存在3个子阶段需要执行的操作
	const subTreeHasEffect =
		(finishedWork.subTressFlags & MutationMask) !== NoFlags;

	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subTreeHasEffect || rootHasEffect) {
		// 存在effect, 才执行子阶段操作
		// * beforeMutation(突变前)
		// * mutation(突变)
		// * 突变是一种操作UI的方式, 指的是将一个属性的一个值变为另一个值, 比如domAPI的操作, 均为突变
		// ? Placement对应的操作核心就在mutation阶段
		// * 传入当前处理完的 wip, 进入mutation逻辑
		commitMutationEffects(finishedWork, root);
		// root.current 指向的fiber tree 就是 current fiber tree, 也就是 hostRootFiber
		// 而 finishedWork是本次更新生成的fiber tree, 也就是wip
		// 此时wip已经处理完成, 因此这里直接更新current即可(还是双缓冲机制)
		// * 此处对应commit阶段做的第一件事情, fiber树的切换, 他发生在mutation和layout之间, 因此这里直接更新current即可, 完成fiberTree切换即可
		root.current = finishedWork;
		// * layout(因为useLayoutEffect, 所以这个阶段也被称为layout阶段)
	} else {
		// 同样的, 不管fiber树上是否存在需要更新插入删除的节点, 都需要更改current tree, 指向上一次的wip
		root.current = finishedWork;
	}

	// commit阶段执行完成后, 重置标志变量 rootDoesHasPassiveEffects
	rootDoesHasPassiveEffects = false;
	// 重新调度root
	ensureRootInScheduled(root);
}

// 执行副作用
function flushPassiveEffects(
	pendingPassiveEffects: PendingPassiveEffects
): boolean {
	// 当前是否有回调被执行
	let didFlushPassiveEffects = false;
	// 1. 先执行所有的unmount回调
	pendingPassiveEffects.unmount.forEach((effect) => {
		// 已经开始执行了
		didFlushPassiveEffects = true;
		// 接下来执行的都是useEffect的回调
		commitHookEffectListUnmount(Passive, effect);
		// 如果要处理useLayoutEffect, 则直接修改flag即可
	});
	// 执行完成后, 需要对上一次的进行清理
	pendingPassiveEffects.unmount = [];

	// 2. 接着触发所有上次更新的destroy回调
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffects = true;
		// 他必须是Passive的, 同时还得标记有HookHasEffect(被卸载的组件, HookHasEffect已经被移除了)
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	// 3. 触发所有这次更新的create回调(因为create必须在所有上一次的destroy执行完之后才能执行, 因此这里必须要重新遍历一次)
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffects = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	// 清理
	pendingPassiveEffects.update = [];
	// 由于在回调执行的过程中, 可能还存在嵌套的 setState在调用, 因此这里还需要调度一次
	// 继续处理调度流程(处理setState)
	flushSyncCallbacks();
	return didFlushPassiveEffects;
}

// 不可中断的工作循环
function workLoopSync() {
	// 本质上也是个循环, 只要workInProgress不是null, 就持续执行
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

// 可中断的工作循环
function workLoopConcurrent() {
	// 本质上也是个循环, 只要workInProgress不是null, 就持续执行
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	// next是这个fiberNode的子fiberNode
	// 如果next没有了就是null, 那么说明没有子fiber
	// 这个过程就是JSX消费的第一步: fiber有儿子, 遍历儿子
	const next = beginWork(fiber, wipRootRenderLane);
	// fiber中有个字段叫pendingProps, 也就是工作前的props
	// 工作后props保存到了memoizedProps中(beginWork工作结束其实就是同步完成了)
	fiber.memoizedProps = fiber.pendingProps;
	if (next === null) {
		// next为null, 说明递已经走到最深层了, 此时需要一步一步往回
		completeUnitOfWork(fiber);
	} else {
		// 如果没有到最深层, 那么workInProgress标记为 子fiberNode, 然后继续在 workLoop中工作, 向下遍历
		workInProgress = next;
	}
}

// 对应JSX消费第二步: 没有子节点, 遍历兄弟
function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;
	do {
		// 只要node存在, 就继续
		completeWork(node);
		// 兄弟节点
		const sibling = node.sibling;
		if (sibling !== null) {
			// 有兄弟处理兄弟
			workInProgress = sibling;
			return;
		} else {
			// 没有兄弟往上退, 继续处理上层兄弟
			node = node.return;
			workInProgress = node;
		}
	} while (node !== null);
}
