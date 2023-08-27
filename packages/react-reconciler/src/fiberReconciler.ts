// 对外暴露两个函数, 以实现mount时调用的api

import { Container } from 'hostConfig';
import { ReactElement } from '@mini-react/shared';
import { FiberNode, FiberRootNode } from './fiber';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	UpdateQueue
} from './updateQueue';
import { HostRoot } from './workTags';
import { scheduleUpdateOnFiber } from './workLoop';

// 调用 React.createRoot 以后, 在 createRoot 方法内部就会触发 createContainer
export function createContainer(container: Container): FiberRootNode {
	// 初始化 hostRootFiber
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	// 初始化应用入口Fiber, 这里完成后, 那么应用入口中创建 hostRootFiber于FiberRootNode就已经完成, 并且两者已形成关联
	const root = new FiberRootNode(container, hostRootFiber);
	// 为 hostRootFiber 创建一个 updateQueue
	hostRootFiber.updateQueue = createUpdateQueue();
	return root;
}

// 执行render方法时, 内部会调用 updateContainer
// render 方法接收的是一个 ReactElement(所有的jsx被转换后都是ReactElement)
// 其实调用render方法时, 内部就会调用 updateContainer和renderRoot方法
// ReactDOM.render 方法会将需要渲染的 React 元素作为 element 参数传递给 updateContainer 方法，
// 将容器组件的实例作为 container 参数传递给 renderRoot 方法
// 然后， updateContainer 方法会将 element 渲染到 container 中，renderRoot 方法会将渲染结果更新到页面上。
export function updateContainer(
	element: ReactElement | null,
	root: FiberRootNode
) {
	const hostRootFiber = root.current;
	// 首屏渲染触发更新, 首先需要先有一个 update 更新函数
	// ? 传入 element, 表示这个更新方法是和 element 相关的
	// ? 在后续的的beginWork和completeWork中就可以处理这个element
	const update = createUpdate<ReactElement | null>(element);
	// 插入到 hostRootFiber.updateQueue 中
	enqueueUpdate(
		hostRootFiber.updateQueue as UpdateQueue<ReactElement | null>,
		update
	);
	// 通过队列调度功能更新
	scheduleUpdateOnFiber(hostRootFiber);
	return element;
}
