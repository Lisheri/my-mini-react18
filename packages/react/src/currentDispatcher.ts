// dispatcher, 代表的就是当前使用的hooks集合

import { Action } from '@mini-react/shared';

// 所有的hooks
export interface Dispatcher {
	useState: <T>(initialState: (() => T) | T) => [T, Dispatch<T>]; // TODO 暂时使用any表示
	useEffect: (callback: () => (() => void) | void, deps: any[] | null) => void;
}

// useState的第二个参数, 就是一个 dispatch 方法, 接收的action就对应之前实现的 Action, 可以是一个值, 也可以是一个返回新的值的函数
export type Dispatch<State> = (action: Action<State>) => void;

const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;
	if (!dispatcher) {
		// hooks只能在函数组件中执行
		throw new Error('Hooks can only be called inside a component');
	}

	return dispatcher;
};

export default currentDispatcher;
