import { beginWork } from './beginWork';
import { completeWork } from './completeWork';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { HostRoot } from './workTags';

// 全局指针指向正在工作的 fiberNode
let workInProgress: FiberNode | null;

function prepareRefreshStack(root: FiberRootNode) {
	// 用于执行初始化的操作
	// FiberRootNode不是普通Fiber, 不能直接作为 workInProgress
	workInProgress = createWorkInProgress(root.current, {});
}

// 用于连接 updateContainer与renderRoot
// ? 本质上是在fiber中调度update
// ? 在调用 React.createRoot的过程中, 首次触发 scheduleUpdateOnFiber, 传入的就是 hostRootFiber
export function scheduleUpdateOnFiber(fiber: FiberNode) {
	// TODO 调度功能
	// ? 对于入口来说, fiber是hostRootFiber, 但是对于其他的更新流程, 传入的fiber就是当前组件对应的fiber
	// ? 所以需要从当前fiber, 一直往上遍历到 FiberRootNode
	// ? 所以核心在于获取 FiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	// 然后从根节点开始更新流程
	renderRoot(root as FiberRootNode);
}

// 向上查找根fiber
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
		return node.stateNode;
	}
	// 说明没找到
	return null;
}

// renderRoot 主要用于开启更新
// 调用 renderRoot 应当是触发更新的API
function renderRoot(root: FiberRootNode) {
	// 初始化, 让 workInProgress 指向第一个遍历的FiberNode
	// ? 深度优先(先序遍历), 把root丢进去初始化
	prepareRefreshStack(root);
	// 进行首次循环
	do {
		try {
			workLoop();
			break;
		} catch (e) {
			console.error('workLoop发生错误:', e);
			// 有报错就重置 workInProgress
			workInProgress = null;
		}
	} while (true);
}

function workLoop() {
	// 本质上也是个循环, 只要workInProgress不是null, 就持续执行
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function performUnitOfWork(fiber: FiberNode) {
	// next是这个fiberNode的子fiberNode
	// 如果next没有了就是null, 那么说明没有子fiber
	// 这个过程就是JSX消费的第一步: fiber有儿子, 遍历儿子
	const next = beginWork(fiber);
	// fiber中有个字段叫pendingProps, 也就是工作前的props, 工作后props保存到了memorizedProps中(beginWork工作结束其实就是同步完成了)
	fiber.memorizeProps = fiber.pendingProps;
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
		} else {
			// 没有兄弟往上退, 继续处理上层兄弟
			node = node.return;
			workInProgress = node;
		}
	} while (node !== null);
}
