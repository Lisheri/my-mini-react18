import {
	Container,
	Instance,
	appendChildToContainer,
	commitUpdate,
	insertChildToContainer,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import {
	ChildDeletion,
	MutationMask,
	NoFlags,
	Placement,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';

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
			// 子节点存在对应的mutation阶段的操作
			nextEffect = child;
		} else {
			// 当前节点的subTreeFlags中不存在Mutation操作, 或者已经到底
			// 此时需要往上遍历
			// 不包含subTreeFlags那么可能包含Flags, 所以也需要继续往上找
			up: while (nextEffect !== null) {
				// 执行真正的Mutation操作
				commitMutationEffectsOnFiber(nextEffect);
				// 找兄弟
				const sibling: FiberNode | null = nextEffect.sibling;
				if (sibling !== null) {
					nextEffect = sibling;
					// 继续处理sibling, 然后停止内层while
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

	// 处理update
	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		// 移除标记
		finishedWork.flags &= ~Update;
	}
	// TODO 判断childDeletion

	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions;
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				// 每个节点都是需要被删除的fiber
				commitDeletion(childToDelete);
			});
		}
		// 移除标记
		finishedWork.flags &= ~ChildDeletion;
	}
};

// 需要拿到parentDOM, 以及 finishedWork 对应的DOM节点
const commitPlacement = (finishedWork: FiberNode) => {
	// 1. 需要知道插入到哪个爹下面
	// 2. 需要知道finishedWork这个fiber对应的DOM节点
	if (__DEV__) {
		console.warn('执行Placement操作', finishedWork);
	}

	// parentDOM 寻找爹(获取的是宿主环境的爹节点)
	const hostParent = getHostParent(finishedWork);

	// 寻找 host sibling
	const sibling = getHostSibling(finishedWork);

	// 找到 finishedWork对应的DOM, 并插入到 hostParent
	if (hostParent !== null) {
		// appendChild / insertBefore
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
};

// 要支持移动, 就需要支持parentNode.insertBefore
// insertBefore需要找到 [目标兄弟Host节点]
// 找到 host sibling
// 然后执行insertBefore, 插入节点
/**
 * 1.目标兄弟节点, 可能并不是目标fiber的直接兄弟节点
 * 例如:
 * <A/><B/>
 * 这样对于A组件来说, 他的目标兄弟节点并不是B, 因为B是一个函数组件, 而是B组件的子组件根节点
 * 甚至可能B里面还有嵌套的D E F等组件
 * 因此需要递归往下找儿子, 直到找到第一个Host类型的节点
 *
 * 组件的Host sibling是其父节点的sibling
 * 例如
 * <App /><div />
 * function App() {
 *  return <A />
 * }
 * 上述A组件的sibling, 其实对应的就是其父节点的sibling
 * 这种情况需要往上找, 找到其父节点的兄弟节点
 *
 * 2. 不稳定的Host节点不能作为 [目标兄弟Host节点]
 * 例如
 * A 被标记为了 Placement, 然后对于B节点寻找其 host sibling时, 此时找到B的 host sibling 是 A
 * 但是 A 本身就在移动, 那么插入B就不能以A为依据, 因为这样插入的位置是不稳定的, 因为B的位置是根据初始状态的A决定的, 但是A移动后, B也会发生变化, 因此不能以A作为 host sibling
 */
function getHostSibling(fiber: FiberNode): Instance | null {
	let node: FiberNode = fiber;
	findSibling: while (true) {
		// 2. 没有兄弟节点, 直接向上遍历
		while (node.sibling === null) {
			const parent = node.return;
			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				// 没找到
				return null;
			}
			// 向上找
			node = parent;
		}
		// 1. 有兄弟节点, 但是兄弟不是一个 HostText或者 HostComponent, 那么需要向下遍历找到叶子节点
		node.sibling.return = node.return;
		node = node.sibling;
		// 这就代表他的直接sibling不是一个Host类型的节点
		while (node.tag !== HostText && node.tag !== HostComponent) {
			// 向下遍历, 寻找子孙节点
			if ((node.flags & Placement) !== NoFlags) {
				// 代表当前节点是不稳定的, 它存在插入标记, 不能作为host sibling
				continue findSibling;
			}
			if (node.child === null) {
				// 到底了
				continue findSibling;
			} else {
				// 往下走
				node.child.return = node;
				node = node.child;
			}
		}
		if ((node.flags & Placement) === NoFlags) {
			// 找到了
			return node.stateNode;
		}
	}
}

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
function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance | null
) {
	// 需要对传入的fiber 找到真正的 宿主节点, 然后 append到 hostParent中
	// 这里期望的host类型只有HostComponent以及HostText, 对于插入的节点就这两种, 不会存在HostRoot
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			// 往前插入
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			// stateNode对应的就是宿主环境的节点
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}
		return;
	}
	// 如果当前的 finishedWork对应的tag不是上述两种类型, 说明他并非是真实的宿主节点对应的fiberNode
	// 此时需要递归往下查找根宿主节点
	const child = finishedWork.child;
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent, before);
		// 找child对应的sibling
		// ? fiber对应的完全可能是 Fragment
		let sibling = child.sibling;
		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent, before);
			sibling = sibling.sibling;
		}
	}
}

function commitDeletion(childToDelete: FiberNode) {
	// 需要递归删除
	// 假设需要删除一个 <div><App /> 12312 <span><Child /></span></div>
	// 因此这里删除div时, 实际上是删除这个div的子树
	let rootHostNode: FiberNode | null = null; // 根hostComponent

	// 递归子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				// TODO 解绑ref
				return;
			case HostText:
				// 标记第一个HostComponent
				if (rootHostNode === null) {
					rootHostNode = unmountFiber;
				}
				return;
			case FunctionComponent:
				// TODO useEffect unmount、解绑ref
				return;
			// TODO 如果还有 ClassComponent, 那么会调用 componentDidUnmount钩子
			default:
				if (__DEV__) {
					console.warn('未处理的 unmount 类型', unmountFiber);
				}
				break;
		}
	});
	// 移除 rootHostComponent的DOM
	if (rootHostNode !== null) {
		// 找到hostParent(需要删除的节点的爹)
		const hostParent = getHostParent(rootHostNode);
		// 删除当前儿子
		hostParent &&
			removeChild((rootHostNode as FiberNode).stateNode, hostParent);
	}
	// 重置标记(因为已经删了， 因此需要从fiberTree中移除对应节点, 让gc回收)
	childToDelete.return = null;
	childToDelete.child = null;
}

// 用于递归子树
/**
 *
 * @param root 需要递归的子树的根节点
 * @param onCommitUnmount 递归到当前 fiber 时执行的回调函数
 */
function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	// 整体就是一个dfs
	let node = root;
	while (true) {
		onCommitUnmount(node);
		// 向下处理儿子
		if (node.child) {
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === root) {
			// 终止
			return;
		}
		while (node.sibling === null) {
			// 无兄弟
			if (node.return === null || node.return === root) {
				return;
			}
			// 兄弟处理完了, 继续处理其他儿子
			node = node.return;
		}
		// 处理兄弟
		node.sibling.return = node.return;
		node = node.sibling;
	}
}
