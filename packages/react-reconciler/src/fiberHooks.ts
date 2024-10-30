import { FiberNode } from './fiber';
import internals from '@mini-react/shared/internals';
import type { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import {
	UpdateQueue,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate
} from './updateQueue';
import { Action } from '@mini-react/shared';
import { scheduleUpdateOnFiber } from './workLoop';

const { currentDispatcher } = internals;

// 当前正在render的fiber(其实就类似Vue的currentInstance, 指向当前正在处理的组件)
let currentlyRenderingFiber: FiberNode | null = null;
// 指向当前正在处理的Hook
let workInProgressHook: Hook | null = null;

interface Hook {
	// * 对于useState, 这个字段代表的是保存的状态, 但是对于其他的hook, 他的意义是不一样的
	memoizedState: any; // hook自身的状态
	updateQueue: unknown; // 触发更新使用的队列
	next: Hook | null; // 指向下一个Hook
}

export function renderWithHooks(wip: FiberNode) {
	// 指向正在处理的fiber
	currentlyRenderingFiber = wip;
	// 重置
	wip.memoizedState = null;

	const current = wip.alternate;
	if (current !== null) {
		// update
	} else {
		// mount
		// 这里将共享空间中的current, 指向mount时的hooks实现
		currentDispatcher.current = HooksDispatcherOnMount;
	}
	const Component = wip.type; // 函数组件的执行函数, 就保存在FiberNode.type上
	const props = wip.pendingProps; // 新的函数
	const children = Component(props); // 执行函数, 得到新的children, 也就是函数组件的返回结果, 作为函数组件对应的FiberNode.children
	// TODO 这里应该重置为上一个正在处理的fiber
	// 重置
	currentlyRenderingFiber = null;
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
	// 这个其实和 updateContainer类似
	// 1. 创建update
	const update = createUpdate<State>(action);
	// 2. 将update推入updateQueue
	enqueueUpdate<State>(updateQueue, update);
	// 3. 队列调度更新(updateContainer是从根节点开始调度, 而这里是从当前fiber开始调度更新)
	// 内部一个关键逻辑就是从当前节点开始往上查找根节点
	scheduleUpdateOnFiber(fiber);
}

// 用于获取当前正在处理的hook对应的数据
function mountWorkInProgressHook(): Hook {
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

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState
};
