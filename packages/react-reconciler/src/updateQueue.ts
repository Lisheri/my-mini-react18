// 更新队列

import { Action } from '@mini-react/shared';

// Update数据结构
export interface Update<State> {
	// 触发更新的函数
	action: Action<State>;
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
}

// 创建 update
export const createUpdate = <T>(action: Action<T>): Update<T> => {
	return {
		action
	};
};

// 创建 updateQueue
export const createUpdateQueue = <State>(): UpdateQueue<State> => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<State>;
};

// 往updateQueue中添加update
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	updateQueue.shared.pending = update;
};

// UpdateQueue消费Update的方法
// 这个方法接收一个初始状态以及需要消费的update
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memorizedState: State } => {
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		// 更新完成的状态, fiber也需要
		memorizedState: baseState
	};

	// ---------------------- 消费过程 ------------------------------
	// 有两种消费的情况
	// 如果pendingUpdate存在
	if (pendingUpdate !== null) {
		// baseUpdate: 1, update: 2 -> memorizedState: 2
		// baseUpdate: 1, update: x => 2 * x -> memorizedState: update(baseUpdate)
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			// action为函数, 对应第二种类型
			result.memorizedState = action(baseState);
		} else {
			// 否则memorizedState 就是 action本身(也就是传入setState的参数)
			result.memorizedState = action;
		}
	}

	return result;
};
