import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';

// 全局指针指向正在工作的 fiberNode
let workInProgress: FiberNode | null;

// * 用于执行初始化的操作
function prepareRefreshStack(root: FiberRootNode) {
	// FiberRootNode不是普通Fiber, 不能直接作为 workInProgress
	workInProgress = createWorkInProgress(root.current, {});
}

// 用于连接 updateContainer与renderRoot
// ? 本质上是在fiber中调度update
// ? 在调用 React.createRoot的过程中, 首次触发 scheduleUpdateOnFiber, 传入的就是 hostRootFiber
export function scheduleUpdateOnFiber(fiber: FiberNode) {
	// TODO 调度功能
	// ? 对于入口来说, fiber是hostRootFiber, 但是对于其他的更新流程, 传入的fiber就是当前组件对应的fiber
	// ? 组件对应的 ComponentFiber 更新, 需要回到根节点, 再往下查找
	// ? 所以需要从当前fiber, 一直往上遍历到 FiberRootNode
	// ? 所以核心在于获取 FiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	// 然后从根节点开始更新流程
	renderRoot(root as FiberRootNode);
}

// 向上查找根fiber, 也就是fiberRootNode
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
		// hostRootFiber是通过 stateNode指向fiberRootNode
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
			if (__DEV__) {
				// 仅开发环境打印
				console.error('workLoop发生错误:', e);
			}
			// 有报错就重置 workInProgress
			workInProgress = null;
		}
	} while (true);

	// workLoop完成后, 这里就可以得到一颗新创建的FiberNode Tree
	// ? 这棵树在 root.current.alternate 上
	// ? root是 fiberRootNode, 他的current指向 hostRootFiber
	// ? 他的 alternate 是整个更新开始时, 也就是在 prepareRefreshStack 中创建的 wip
	// ? 此时 wip 已经处理完成了
	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;

	// 根据 wip fiberNode 树中的flags执行首屏渲染操作
	// commit流程入口
	commitRoot(root);
}

// 可以类比于git commit这个过程, 用于提交
// 就是将workLoop生成的产物提交到宿主环境
// 一共三个子阶段:
// + beforeMutation
// + mutation
// + layout
function commitRoot(root: FiberRootNode) {
	// 1. 暂存finishedWork
	const finishedWork = root.finishedWork;
	if (finishedWork === null) return;
	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}

	// 2. 重置(此时已经暂存到了 finishedWork 中)
	root.finishedWork = null;

	// 3. 判断是否存在3个子阶段需要执行的操作
	const subTreeHasEffect =
		(finishedWork.subTressFlags & MutationMask) !== NoFlags;

	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;

	if (subTreeHasEffect || rootHasEffect) {
		// 存在effect, 才执行子阶段操作
		// * beforeMutation(突变前)
		// * mutation(突变)
		// * 突变是一种操作UI的方式, 指的是将一个属性的一个值变为另一个值, 比如domAPI的操作, 均为突变
		// ? Placement对应的操作核心就在mutation阶段
		// * 传入当前处理完的 wip, 进入mutation逻辑
		commitMutationEffects(finishedWork);
		// root.current 指向的fiber tree 就是 current fiber tree, 也就是 hostRootFiber
		// 而 finishedWork是本次更新生成的fiber tree, 也就是wip
		// 此时wip已经处理完成, 因此这里直接更新current即可(还是双缓冲机制)
		// * 此处对应commit阶段做的第一件事情, fiber树的切换, 他发生在mutation和layout之间, 因此这里直接更新current即可, 完成fiberTree切换即可
		root.current = finishedWork;
		// * layout(因为useLayoutEffect, 所以这个阶段也被称为layout阶段)
	} else {
		// 同样的, 不管fiber树上是否存在需要更新插入删除的节点, 都需要更改current tree, 指向上一次的wip
		root.current = finishedWork;
	}
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
	// fiber中有个字段叫pendingProps, 也就是工作前的props
	// 工作后props保存到了memoizedProps中(beginWork工作结束其实就是同步完成了)
	fiber.memoizedProps = fiber.pendingProps;
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
