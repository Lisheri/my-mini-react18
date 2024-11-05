import { Props, ReactElement, REACT_ELEMENT_TYPE } from '@mini-react/shared';
import { isValidElement } from 'react';
import {
	createFiberFromElement,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { ChildDeletion, Placement } from './fiberFlags';
import { HostText } from './workTags';

/**
 *
 * @param shouldTrackEffects 是否应该追踪副作用
 *  ? 在不追踪副作用的情况下, 就不会标记一些副作用的Placement 的 Flags
 *  ? 这个策略本质上是针对mount流程的, 只有在mount流程时, 才会存在插入大量的DOM节点, 而在update流程时, 只存在更新局部的节点
 * @return reconcileChildFibers 处理儿子fiber
 */
function createChildReconciler(shouldTrackEffects: boolean) {
	// 删除节点
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode): void {
		if (!shouldTrackEffects) {
			return;
		}
		const deletions = returnFiber.deletions; // 这是一个数组结构, 数组内部保存了当前节点下所有需要被删除的儿子
		if (deletions === null) {
			// 如果没有需要删除的节点, 那么就创建一个新的数组, 并且加入当前节点作为需要删除的节点
			returnFiber.deletions = [childToDelete];
			returnFiber.flags |= ChildDeletion;
		} else {
			returnFiber.deletions!.push(childToDelete);
			// 因为deletions曾经已经有内容了, 因此说明flags中已经标记了 ChildDeletion, 所以这里不需要重复收集
		}
	}

	// 为剩下的兄弟节点增加删除标记
	function deleteRemainingChildren(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null
	) {
		if (!shouldTrackEffects) {
			// 无需追踪副作用则不需要标记
			return;
		}

		let childToDelete = currentFirstChild;
		while (childToDelete !== null) {
			deleteChild(returnFiber, childToDelete);
			// 处理兄弟
			childToDelete = childToDelete.sibling;
		}
	}
	// 这里在外层函数处理参数差异, 在生成一个新的函数
	// + 按理来说不标记副作用以后, 是不会生成 Placement 标记的, 但实际上我们希望的是对根节点执行一次 Placement
	// + 但实际上在初始化的过程中, 也就是在 workLoop -> renderRoot -> prepareRefreshStack 时
	// + 会创建第一个 workInProgress, 也是 root.current, 也就是 hostRootFiber
	// + 意味着, 在更新过程中, 有一个节点同时存在 current 以及 workInProgress, 也就是挂载的根节点对应的fiber, 也就是 hostRootFiber
	// + 那么对应到这里的逻辑, 对于首屏渲染, 挂载的组件树(<App/>)所有fiber都会走到 mount 的逻辑中
	// + 对于 hostRootFiber, 就会走到 update 逻辑中, 他会被插入一个 Placement Flag, 通过这个 Placement Flag, 最终会执行一次 dom 插入操作
	// + 就会将离屏构建好的dom节点插入到dom树中

	// 单节点diff, 区分 A1 -> B1 | A1 -> A2 | ABC -> A | ABC -> A1
	// 一共四种情况
	// 1. key相同, type相同, 复用当前节点, 其他删除. 如ABC -> A
	// 2. key相同, type不同, 没有可以复用的节点, 需要全部删除, 在创建新的. 如 ABC -> A1
	// 3. key不同, type相同, 当前节点不能复用, 兄弟节点可能可以复用
	// 4. key不同, type不同, 当前节点不能复用, 兄弟节点可能可以复用
	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElement
	): FiberNode {
		// TODO 核心在于根据 ReactElement创建一个Fiber, 然后返回
		// --------- update流程 ---------
		// TODO 这里仅处理了单节点, 未处理多节点
		// 1. 获取key
		const key = element.key;
		work: while (currentFiber !== null) {
			// update情况
			if (currentFiber.key === key) {
				// key相同, 接着比较type是否相同(也许key没变, 但是节点类型发生了变化)
				if (isValidElement(element)) {
					// * 1. key相同 type 相同, 复用当前节点, 删除所有旧节点
					if (currentFiber.type === element.type) {
						// type相同, 说明这个节点是同一个节点, 可以复用
						// 但是这里不需要做任何处理, 因为这个fiber会被返回, 由reconcileChildFibers处理
						// 新的props在element上
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber;
						// 当前节点可复用, 需要标记剩下的节点删除
						deleteRemainingChildren(returnFiber, currentFiber.sibling); // 当前是复用的, 因此第一个处理节点是他的下一个兄弟
						return existing;
					}
					// * 2. key相同, type不同, 删除所有旧的节点
					deleteRemainingChildren(returnFiber, currentFiber);
					break work;
				} else {
					if (__DEV__) {
						console.error('未实现的react类型', element);
						break work;
					}
				}
			} else {
				// * key不同都走这里处理
				// key不同, 那么需要删除key不同的child, 然后继续处理其他的 sibling(兄弟), 继续while循环即可
				deleteChild(returnFiber, currentFiber);
				currentFiber = currentFiber.sibling;
			}
		}

		// --------- mount流程 | 创建新的 ---------
		// 到此为止, 上面的while走完了, 所有的兄弟也都处理完了, 此时如果走到了这里, 就创建一个新节点
		// 1. 创建fiber
		const fiber = createFiberFromElement(element);
		// 2. 将创建出的fiber的爹指向入参指定的爹
		fiber.return = returnFiber;
		// 3. 返回这个fiber(reconcileChildFibers执行完成后, 会将这里返回的fiber挂到returnFiber.child上, 这里不需要进行处理)
		return fiber;
	}

	function reconcileSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		// 就是内部的文本
		content: string | number
	): FiberNode {
		while (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// 类型没有变, 直接复用
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				// 其他兄弟标记为删除
				deleteRemainingChildren(returnFiber, currentFiber.sibling);
				return existing;
			}
			// currentFiber.tag不再是HostTet, 也就是说类型发生了变化, 需要删除旧的, 然后创建新的
			// * <div /> -> 123
			deleteChild(returnFiber, currentFiber);
			currentFiber = currentFiber.sibling; // 处理兄弟
		}
		// 与 reconcileSingleElement 类似
		// ---- 创建HostText流程 ----
		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	// 利用标志变量决定是否生成副作用标记
	function placeSingleChild(fiber: FiberNode): FiberNode {
		if (shouldTrackEffects && fiber.alternate === null) {
			// 刚创建的fiber, 他一定是 workInProgress fiber
			// 他的 alternate 指向 current, current不存在, 说明是首次渲染节点, 此时需要将flags设为 Placement
			// 标记
			fiber.flags |= Placement;
		}
		// ? 只有主动标识且首次渲染, 才需要标记 placement, 其余情况均不需要做任何处理
		return fiber;
	}

	/**
	 * @param returnFiber 父fiber
	 * @param currentFiber 当前子节点的 currentFiberNode
	 * @param newChild 子节点对应的 ReactElement
	 */
	return function reconcileChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		// 子节点
		newChild?: ReactElement | string | number
	): FiberNode | null {
		// ? 判断当前fiber的类型
		if (typeof newChild === 'object' && newChild !== null) {
			// 单节点情况
			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE:
					// 单节点
					// 创建出新的Fiber后, 直接传给 placeSingleChild, 决定是否扩展 Placement标记
					return placeSingleChild(
						reconcileSingleElement(returnFiber, currentFiber, newChild)
					);
				default:
					if (__DEV__) {
						console.error('未实现的reconcile类型', newChild);
					}
					return null;
			}
		}
		// TODO 多节点情况: ul>li*3, 暂不处理
		// hostText 文本节点情况
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			// 文本节点
			return placeSingleChild(
				reconcileSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}
		if (currentFiber !== null) {
			// 兜底, 对于未实现的 reconcile类型, 直接标记删除
			deleteChild(returnFiber, currentFiber);
		}

		if (__DEV__) {
			console.error('未实现的reconcile类型', newChild);
		}
		return null;
	};
}

// 追踪副作用(update阶段)
export const reconcileChildFibers = createChildReconciler(true);
// 不追踪副作用(mount阶段)
export const mountChildFibers = createChildReconciler(false);

// 处理复用
function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	// 创建一个克隆fiber
	// * 在创建克隆时, 其实取的是 fiber.alternate, 是双缓存机制中对应的另一个节点, 然后更新它上面的字段, 返回新的wip
	// * 同时这里只要是在复用, 那么实际上使用的永远都是 wip或者current 这两个中的一个, 不会创建新的fiber
	// * current.alternate -> wip, wip.alternate -> current
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}
