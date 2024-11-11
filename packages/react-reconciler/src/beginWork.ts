// 递归中 "递" 的过程

import { ReactElement } from '@mini-react/shared';
import { mountChildFibers, reconcileChildFibers } from './childFibers';
import { FiberNode } from './fiber';
import { renderWithHooks } from './fiberHooks';
import { Lane } from './fiberLanes';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';

// ? 核心工作是比较, 最终返回子fiberNode
export const beginWork = (
	wip: FiberNode,
	renderLane: Lane
): FiberNode | null => {
	// 主要工作是ReactElement与当然fiberNode比较, 然后返回 子fiberNode
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip, renderLane);
		case HostComponent:
			return updateHostComponent(wip);
		case HostText:
			// 对于HostText来说, 他是没有子节点的, 只有text属性
			// 同时递归阶段的递阶段, 主要就是递倒了叶子节点, 然后就不能继续往下了, 也就是需要开启"归"阶段
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip, renderLane);
		case Fragment:
			return updateFragment(wip);
		default:
			if (__DEV__) {
				console.warn(`beginWork未实现类型: ${wip.tag}`);
			}
			return null;
	}
};

function updateFragment(wip: FiberNode): FiberNode {
	const nextChildren = wip.pendingProps; // 获取Fragment子节点,
	reconcileChildren(wip, nextChildren);
	return wip.child as FiberNode;
}

/**
 * 处理HostRoot更新
 * 1. 计算状态最新值
 * 2. 创建子fiberNode
 * @param wip workInProgress 当前处理的FiberNode节点
 * @param renderLane 代表本次更新的lane
 */
function updateHostRoot(wip: FiberNode, renderLane: Lane): FiberNode {
	// 初始状态下 memoizedState 为null
	const baseState = wip.memoizedState;
	const updateQueue = wip.updateQueue as UpdateQueue<ReactElement>;
	// 暂存, 对于首屏渲染, 这个pending就是App对应的Update<ReactElement>
	const pending = updateQueue.shared.pending;
	// 计算pending的update
	// ? 因为计算完以后, 这些pending都会出队, 已经没有用了
	updateQueue.shared.pending = null;
	// 获取最新的 memoizedState, 对于 ReactElement来说, 这个 memoizedState 其实就是传入的 ReactElement
	const { memoizedState } = processUpdateQueue(baseState, pending, renderLane);

	// 更新最新状态
	wip.memoizedState = memoizedState;
	// wip.memoizedState 其实就是 子ReactElement
	const nextChildren = wip.memoizedState;
	// 处理儿子
	// reconcilerChildren 最终会生成子 fiberNode
	reconcileChildren(wip, nextChildren);
	return wip.child as FiberNode;
}

// ? updateHostComponents 不会触发更新, 他只会创建子fiberNode
function updateHostComponent(wip: FiberNode): FiberNode {
	const nextProps = wip.pendingProps;
	const nextChildren = nextProps.children;
	reconcileChildren(wip, nextChildren);
	return wip.child as FiberNode;
}

function updateFunctionComponent(wip: FiberNode, renderLane: Lane): FiberNode {
	const nextChildren = renderWithHooks(wip, renderLane);
	/*
    假设存在一个FC, 如下
    function App() {
      return <img />
    }
    对于App这个组件, 他的children其实就是这个 img组件, 要得到这个组件, 需要对App进行调用
    App() -> img(children)
    因此这里需要封装一个函数, 单独执行上述过程, 来获取nextChildren
  */
	reconcileChildren(wip, nextChildren);
	return wip.child as FiberNode;
}

function reconcileChildren(wip: FiberNode, children?: ReactElement) {
	// ? 主要原因在于我们处理HostRoot时, 对比的是子节点的current FiberNode与子节点的ReactElement生成子节点的wip FiberNode
	// 首先获取current
	const current = wip.alternate;
	if (current !== null) {
		// update流程
		wip.child = reconcileChildFibers(wip, current.child!, children);
	} else {
		// mount
		// mount时, currentFiber是空的
		wip.child = mountChildFibers(wip, null, children);
	}
}
