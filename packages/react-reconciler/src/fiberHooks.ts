import { FiberNode } from './fiber';
import internals from '@mini-react/shared/internals';
import type { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue
} from './updateQueue';
import { Action } from '@mini-react/shared';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLanes } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';

const { currentDispatcher } = internals;

// 当前正在render的fiber(其实就类似Vue的currentInstance, 指向当前正在处理的组件)
let currentlyRenderingFiber: FiberNode | null = null;
// 指向当前正在处理的Hook
let workInProgressHook: Hook | null = null;
// 当前Hook
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

interface Hook {
	// * 对于useState, 这个字段代表的是保存的状态, 但是对于其他的hook, 他的意义是不一样的
	memoizedState: any; // hook自身的状态
	updateQueue: unknown; // 触发更新使用的队列
	next: Hook | null; // 指向下一个Hook
}

// effect数据结构
export interface Effect {
	tag: Flags; // 标记是否需要触发回调的tag
	create: EffectCallback | void; // mount时的回调
	destroy: EffectCallback | void; // unmount时的回调
	deps: EffectDeps;
	next: Effect | null; // 指向下一个Effect
}

// 函数组件的UpdateQueue
export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	// 在传统updateQueue的基础上, 新增一个字段, 指向 effect链表中的最后一个 effect
	// 那么 lastEffect.next永远指向头节点
	lastEffect: Effect | null;
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 指向正在处理的fiber
	currentlyRenderingFiber = wip;
	// 重置 指向的是 hooks链表头节点
	wip.memoizedState = null;
	// 重置effect链表
	wip.updateQueue = null;

	renderLane = lane;

	const current = wip.alternate;
	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		// mount
		// 这里将共享空间中的current, 指向mount时的hooks实现
		currentDispatcher.current = HooksDispatcherOnMount;
	}
	const Component = wip.type; // 函数组件的执行函数, 就保存在FiberNode.type上
	const props = wip.pendingProps; // 新的函数
	// 调用时说明FC正在执行
	const children = Component(props); // 执行函数, 得到新的children, 也就是函数组件的返回结果, 作为函数组件对应的FiberNode.children
	// ? 这里是否应该重置为上一个正在处理的fiber?(针对queue的情况)
	// 全局变量均需要重置
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	// 执行完成后重置
	renderLane = NoLane;
	return children;
}

function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	// 1. 找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();
	let memoizedState: State;
	if (initialState instanceof Function) {
		// 初始状态是一个function
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	// 同时创建一个更新队列
	const queue = createUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;

	// dispatch需要接入现有的更新流程
	// 可以看到这里已经预先传递了 currentlyRenderingFiber以及queue, 因此暴露出去的方法对于用户来说, 只需要传递一个 action即可
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

// 更新时的hooks实现
function updateState<State>(): [State, Dispatch<State>] {
	// 1. 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();
	// 2. 计算新的state
	const queue = hook.updateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	// 置空, 此时pendingUpdate已经被消费完成
	queue.shared.pending = null;

	if (pending !== null) {
		// 处理更新队列
		const { memoizedState } = processUpdateQueue<State>(
			hook.memoizedState,
			pending,
			renderLane
		);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

/**
 *
 * @param fiber 当前正在处理的fiberNode
 * @param updateQueue 当前更新队列
 * @param action 最新状态或者更新状态的函数
 */
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	// 获取当前lane
	const lane = requestUpdateLanes();
	// 这个其实和 updateContainer类似
	// 1. 创建update
	const update = createUpdate<State>(action, lane);
	// 2. 将update推入updateQueue
	enqueueUpdate<State>(updateQueue, update);
	// 3. 队列调度更新(updateContainer是从根节点开始调度, 而这里是从当前fiber开始调度更新)
	// 内部一个关键逻辑就是从当前节点开始往上查找根节点
	scheduleUpdateOnFiber(fiber, lane);
}

// 用于获取当前正在处理的hook对应的数据
function mountWorkInProgressHook(): Hook {
	// mount时是新建的一个Hook, 然后形成链表
	const hook: Hook = {
		memoizedState: null,
		next: null,
		updateQueue: null
	};
	if (workInProgressHook === null) {
		// mount且恰好为第一个hook
		if (currentlyRenderingFiber === null) {
			// 执行了mountState, 此时应该是在一个函数组件中, 执行useState, 此时如果没有正在处理的fiber, 代表当前操作并不在函数组件下, 此时应该报错
			throw new Error('Hooks can only be called inside a component');
		} else {
			workInProgressHook = hook;
			// 这个就代表了mount时的第一个hook, 也就是hook链表的头结点
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时后续的hook
		// 此时需要续上链表
		workInProgressHook.next = hook;
		// 同时更新指向, 方便后续继续往后添加hook
		workInProgressHook = hook;
	}
	return workInProgressHook;
}

// 用于获取更新时当前正在处理的hook对应的数据
function updateWorkInProgressHook(): Hook {
	// 这里和mount不一样的是, 需要从链表中获取当前hook
	// hook 数据从哪里来? 从 currentHook中来
	// TODO 缺少render阶段触发的更新处理
	// 1. 交互阶段触发更新
	let nextCurrentHook: Hook | null = null; // 指向下一个需要处理的Hook
	if (currentHook == null) {
		// 说明即将处理的是FC update时的第一个hook
		const current = currentlyRenderingFiber?.alternate; // 这是currentlyRenderingFiber对应的currentFiber
		if (current != null) {
			nextCurrentHook = current?.memoizedState;
		} else {
			// mount阶段(此时需要处理错误边界)
			nextCurrentHook = null;
		}
	} else {
		// 这个FC update时 后续的 hook, 直接向后取
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		// 说明此时已经走到了曾经update或者mount中, 不存在的hook(但是为何会有这种情况?一般是一一对应)
		// 说明存在了一个hook, 在if条件语句中进行了调用, 并且mount时, 没有进入对应的条件
		// 渲染了更多的Hook
		throw new Error(
			`Rendered more hooks than during the previous render in FC: ${currentlyRenderingFiber?.type}`
		);
	}

	currentHook = nextCurrentHook as Hook;
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		next: null,
		updateQueue: currentHook.updateQueue
	};
	// 这里之后和mount逻辑一样
	if (workInProgressHook === null) {
		if (currentlyRenderingFiber === null) {
			throw new Error('Hooks can only be called inside a component');
		} else {
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}
	return workInProgressHook;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect
};

// 更新时的hooks实现
const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect
};

// 不同的effect需要共用同一个effect数据结构
// 需要在effect数据结构上新增一个tag字段, 用作区分
function mountEffect(create: EffectCallback, deps: EffectDeps) {
	// 代表mount阶段的useEffect
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	// mount时直接触发 create回调
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect; // 代表mount时这个fiber需要处理副作用
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined, // mount时没有destroy回调
		nextDeps
	);
}

function updateEffect(create: EffectCallback, deps: EffectDeps) {
	// 代表mount阶段的useEffect
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;
	if (currentHook !== null) {
		// 当前useEffect对应的currentHook, 其memoizedState就代表了当前effect在上一次更新时对应的effect
		const preEffect = currentHook.memoizedState as Effect;
		destroy = preEffect.destroy;
		if (nextDeps !== null) {
			// 浅比较依赖
			const preDeps = preEffect.deps;
			if (areHookInputsEqual(preDeps, nextDeps)) {
				// 依赖没有变化
				// 这里就是只保存effect, 但是由于flag缺乏 HookHasEffect, 因此不会触发副作用
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 不相等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputsEqual(
	nextDeps: EffectDeps,
	prevDeps: EffectDeps
): boolean {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(nextDeps[i], prevDeps[i])) {
			continue;
		} else {
			return false;
		}
	}
	return true;
}

// effect自身就会形成一条环装链表
function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	// effect对应的环状链表保存在 fiberNode.updateQueue上
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		// 和自己形成环
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 插入effect操作
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			// 不存在
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}

	return effect;
}

// 单独加一个方法, 用于创建函数组件的updateQueue
function createFCUpdateQueue<State>(): FCUpdateQueue<State> {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}
