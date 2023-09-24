import { Container, appendChildToContainer } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags, Placement } from './fiberFlags';
import { HostComponent, HostRoot, HostText } from './workTags';

/*
  案例
  需要考虑的问题在于如下jsx结构
  <App>
    <div>
      <span>只因</span>
    </div>
  </App>

  根节点为App, 叶子节点为 span, 如果span存在flags, 我们需要准确的找到这个flags
  但是现在finishedWork指向的是 App这个根节点
  所以需要递归往下找
*/

// 永远指向下一个需要处理的Fiber tree
let nextEffect: FiberNode | null = null;

// mutation 阶段的具体实现
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;
	while (nextEffect !== null) {
		// 向下遍历
		const child: FiberNode | null = nextEffect.child;
		if (
			(nextEffect.subTressFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			// 子节点存在对应的操作
			nextEffect = child;
		} else {
			// 当前节点的subTreeFlags中不存在Mutation操作, 或者已经到底
			// 此时需要往上遍历
			up: while (nextEffect !== null) {
				// 执行真正的Mutation操作
				commitMutationEffectsOnFiber(nextEffect);
				// 找兄弟
				const sibling: FiberNode | null = nextEffect.sibling;
				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}
				// 往上
				nextEffect = nextEffect.return;
			}
		}
	}
};

// 这里的finishedWork是真正存在 flags的节点
const commitMutationEffectsOnFiber = (finishedWork: FiberNode) => {
	const flags = finishedWork.flags;

	// 处理 Placement
	if ((flags & Placement) !== NoFlags) {
		// 说明当前节点存在Placement操作
		commitPlacement(finishedWork);
		// 将Placement从flags中移除
		// ? 所有的标记都是从 1 | OtherFlag 形成的
		// ? 而 1 | OtherFlag & (~OtherFlag) => 还原为 1
		// ? 因此利用此法可以快速移除标记
		finishedWork.flags &= ~Placement;
	}

	// TODO 判断update

	// TODO 判断childDeletion
};

// 需要拿到parentDOM, 以及 finishedWork 对应的DOM节点
const commitPlacement = (finishedWork: FiberNode) => {
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}

	// parentDOM
	const hostParent = getHostParent(finishedWork);

	// 找到 finishedWork对应的DOM, 并插入到 hostParent
	if (hostParent !== null) {
		appendPlacementNodeIntoContainer(finishedWork, hostParent);
	}
};

// 获取父级dom节点
function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return;

	while (parent) {
		const parentTag = parent.tag;
		// hostComponent 或者 hostRoot
		if (parentTag === HostComponent) {
			// 对于 HostComponent来说, 它对应的宿主环境节点(比如DOM节点)保存在 stateNode 中
			return parent.stateNode as Container;
		}

		if (parentTag === HostRoot) {
			// 对于hostRootFiber来说, 他的 stateNode 指向的是 fiberRootNode
			// 而 fiberRootNode.container就是挂载的宿主节点
			return (parent.stateNode as FiberRootNode).container as Container;
		}
		parent = parent.return;
	}

	if (__DEV__) {
		console.warn('host parent未找到');
	}
	return null;
}

// 将finishedWork对应的宿主节点插入到 他爹(hostParent)身上
function appendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container
) {
	// 需要对传入的fiber 找到真正的 宿主节点, 然后 append到 hostParent中
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		appendChildToContainer(hostParent, finishedWork.stateNode);
		return;
	}
	// 如果当前的 finishedWork对应的tag不是上述两种类型, 说明他并非是真实的宿主节点对应的fiberNode
	// 此时需要递归往下查找根宿主节点
	const child = finishedWork.child;
	if (child !== null) {
		appendPlacementNodeIntoContainer(child, hostParent);
		// 找child对应的sibling
		// ? fiber对应的完全可能是 Fragment
		let sibling = child.sibling;
		while (sibling !== null) {
			appendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
