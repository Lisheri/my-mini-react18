import { FiberNode } from './fiber';

export function renderWithHooks(wip: FiberNode) {
	const Component = wip.type; // 函数组件的执行函数, 就保存在FiberNode.type上
	const props = wip.pendingProps; // 新的函数
	const children = Component(props); // 执行函数, 得到新的children, 也就是函数组件的返回结果, 作为函数组件对应的FiberNode.children
	return children;
}
