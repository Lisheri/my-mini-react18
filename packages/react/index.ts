import { jsxDEV } from './src/jsx';
import currentDispatcher, {
	resolveDispatcher,
	Dispatcher
} from './src/currentDispatcher';

// 暴露hooks
export const useState: Dispatcher['useState'] = <T>(
	initialState: (() => T) | T
) => {
	// 通过 resolveDispatcher就可以实现从 react -> hooks 的连接
	// 后续会通过 resolveDispatcher 来获取到当前的hooks集合, 以及切换不同的hooks集合
	const dispatcher = resolveDispatcher();
	return dispatcher.useState<T>(initialState);
};

// 数据共享层(内部数据你别动, 动了就会被炒)
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
};

export default {
	// 版本
	version: '0.0.0',
	// react.createElement, 虽然在17以后, jsx编译都是直接使用jsx方法
	createElement: jsxDEV
};
