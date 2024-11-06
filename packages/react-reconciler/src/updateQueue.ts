// 更新队列

import { Action } from '@mini-react/shared';
import type { Dispatch } from 'react/src/currentDispatcher';

// Update数据结构
export interface Update<State> {
	// 触发更新的函数
	action: Action<State>;
	// 指向新的update
	next: Update<any> | null;
}

// ------------------------------- React触发更新的方式 ------------------------------------------
// 对于React有两种触发更新的方式
// 不仅可以传一个状态的最新值, 还可以传一个函数, 返回值表示最新的状态
// 因此 Action 要处理下面两种形式
// this.setState({xx:1})和this.setState(() => ({xx:2}))
// ------------------------------- React触发更新的方式 ------------------------------------------

export interface UpdateQueue<State> {
	shared: {
		pending: Update<State> | null;
	};
	dispatch: Dispatch<State> | null;
}

// 创建 update
export const createUpdate = <T>(action: Action<T>): Update<T> => {
	return {
		action,
		next: null
	};
};

// 创建 updateQueue
export const createUpdateQueue = <State>(): UpdateQueue<State> => {
	return {
		// 这里使用 shared: {pending}, 主要利用指针shared, 让 current和wip都可以访问同一个pending
		shared: {
			pending: null
		},
		// 兼容Hooks的数据结构, 用于保存Hooks的dispatch
		dispatch: null
	} as UpdateQueue<State>;
};

// 往updateQueue中添加update
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	const pending = updateQueue.shared.pending;
	// 这里的pending不应该直接赋值, 而是调整为一个链表
	// updateQueue.shared.pending = update;
	if (pending === null) {
		// 当前还没有插入update
		// a -> a
		update.next = update;
	} else {
		// 当前的queue中已经存在了update
		// ? 这里其实还是要保持有一个环状链表, 只是插入了一个新的Update, 因此这个新的Update需要指向头节点, 但是上一个节点(pending), 需要指向这个新的节点
		// ? pending.next本身就是指向头结点的
		update.next = pending.next;
		pending.next = update;
	}
	// pending始终指向当前正在处理的update
	updateQueue.shared.pending = update;
};

// UpdateQueue消费Update的方法
// 这个方法接收一个初始状态以及需要消费的update
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memoizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		// 更新完成的状态, fiber也需要
		memoizedState: baseState
	};

	// ---------------------- 消费过程 ------------------------------
	// 有两种消费的情况
	// 如果pendingUpdate存在
	if (pendingUpdate !== null) {
		// baseUpdate: 1, update: 2 -> memoizedState: 2
		// baseUpdate: 1, update: x => 2 * x -> memoizedState: update(baseUpdate)
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			// action为函数, 对应第二种类型
			result.memoizedState = action(baseState);
		} else {
			// 否则memoizedState 就是 action本身(也就是传入setState的参数)
			result.memoizedState = action;
		}
	}

	return result;
};
