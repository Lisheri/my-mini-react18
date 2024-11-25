// 更新队列

import { Action } from '@mini-react/shared';
import type { Dispatch } from 'react/src/currentDispatcher';
import { Lane, isSubsetOfLanes } from './fiberLanes';

// Update数据结构
export interface Update<State> {
	// 触发更新的函数
	action: Action<State>;
	// 指向新的update
	next: Update<any> | null;
	lane: Lane; // 代表update本身的优先级
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
export const createUpdate = <T>(action: Action<T>, lane: Lane): Update<T> => {
	return {
		action,
		next: null,
		lane
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
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): {
	memoizedState: State;
	baseState: State;
	baseQueue: Update<State> | null;
} => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		// 更新完成的状态, fiber也需要
		memoizedState: baseState,
		baseState,
		baseQueue: null
	};

	// 引入lane之后
	// 首先需要考虑优先级
	// update是一条链表, 需要遍历

	// ---------------------- 消费过程 ------------------------------
	// 有两种消费的情况
	// 如果pendingUpdate存在
	if (pendingUpdate !== null) {
		// pendingUpdate指向的是环状链表最后一个节点, 因此他的next, 就是头节点
		let first = pendingUpdate.next as Update<any>;
		const pending = pendingUpdate.next as Update<any>;

		let newBaseState = baseState; // baseState参与计算后可能会发生变化, 因此需要保存新的
		let newBaseQueueFirst: Update<State> | null = null; // 链表头
		let newBaseQueueLase: Update<State> | null = null; // 链表尾部
		let newState = baseState; // 本次计算的计算结果(中间量)

		do {
			const updateLane = first.lane;
			// 如果当前的updateLane, 和renderLane一致, 则执行计算
			// 这里应该是判断优先级是否足够, 而不是仅判断updateLane和renderLane是否全等
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不足, 被跳过
			} else {
				// 优先级足够
				// 执行计算
				// baseUpdate: 1, update: 2 -> memoizedState: 2
				// baseUpdate: 1, update: x => 2 * x -> memoizedState: update(baseUpdate)
				const action = pendingUpdate.action;
				// 这里不应该直接更新 memoizedState, 而是应该反复的修改baseState, 最后一次进入时, 在同一更新岛 memoizedState上
				if (action instanceof Function) {
					// action为函数, 对应第二种类型
					// result.memoizedState = action(baseState);
					newState = action(baseState);
				} else {
					// 否则memoizedState 就是 action本身(也就是传入setState的参数)
					// result.memoizedState = action;
					newState = action;
				}
			}
			// 继续处理下一个
			first = first.next as Update<any>;
		} while (pending !== first);
	}

	// 此时 baseState 就是最终的状态
	result.memoizedState = baseState;
	return result;
};
