import { Props, ReactElement, REACT_ELEMENT_TYPE } from '@mini-react/shared';
import { isValidElement } from 'react';
import {
	createFiberFromElement,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { ChildDeletion, Placement } from './fiberFlags';
import { HostText } from './workTags';

type ExistingChildren = Map<string | number, FiberNode>;

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

	// 比起单节点, 多节点需要处理的Flag, 除了插入和删除以外, 还有一个移动
	// 整体流程分为4步
	// 1. 将current中所有同级的fiber保存在Map中
	// 2. 遍历newChild数组, 对于每个遍历到的element, 存在两种情况:
	// 所谓的newChild数组, 比如说 ul > li*3, 那么这里的newChild就是 [li, li, li]
	//    - 在Map中存在对应的 current fiber, 且可以复用(key 一样, type一样, 就可以复用, 使用useFiber)
	//    - 在Map中不存在对应的 current fiber, 或不能复用
	// 3. 判断是插入还是移动
	// 4. 最后Map中剩下的都标记为删除(最后剩下的节点, 既不能插入, 也不能移动, 直接删了就行)
	/**
	 *
	 * @param returnFiber 父fiber
	 * @param currentFirstChild 当前第一个儿子
	 * @param newChild 儿子们, 因为不止ReactElement这一种类型, 因此本身这里就是一个any[]
	 */
	function reconcileChildrenArray(
		returnFiber: FiberNode,
		currentFirstChild: FiberNode | null,
		newChild: any[]
	): FiberNode | null {
		// 1. 将current中所有同级的fiber保存在Map中
		// 最后一个可复用fiber在current中的索引
		let lastPlacedIndex = 0;
		// 创建的最后一个fiber
		let lastNewFiber: FiberNode | null = null;
		// 创建的第一个fiber, 因为当前 reconcileChildrenArray 最终返回的是children中的第一个fiber, 因此需要记录, 并且返回他
		let firstNewFiber: FiberNode | null = null;
		const existingChildren: ExistingChildren = new Map();
		// current对应的是更新前, 是一个单向链表
		// 比如说 ABC -> CBD, 其中ABC就是current, current初始状态指向头结点A
		// 对于 newChild来说, 是一个数组, 其中每个元素都是 ReactElement(这里是, 但是对于react还有其他类型, 均为jsx转换过来)
		let current = currentFirstChild;
		// 遍历完成后, 就得到了一个 key -> currentFiber 的 map
		while (current !== null) {
			// 没有key, 就用索引作为map的key, 有就直接使用
			const keyToUse = current.key !== null ? current.key : current.index;
			existingChildren.set(keyToUse, current);
			current = current.sibling;
		}
		// 2. 遍历newChild, 寻找是否可复用
		for (let i = 0; i < newChild.length; i++) {
			// 2. 寻找是否可复用
			//    - 根据key从map中获取 current fiber, 如果不存在, 说明不能复用
			//    - 然后是分情况处理
			//      + element是HostText, current fiber是么?
			//      + element是其他ReactElement, current fiber是么?
			//      TODO element 是数组或Fragment, current fiber是么?(暂不实现, 放后面搞)
			const after = newChild[i]; // 更新后的element
			const newFiber = updateFromMap(returnFiber, existingChildren, i, after);
			// 不管之前是什么, 更新后变成了 false, 或者 null, 或者undefined, 那么最终返回的值都是null
			if (newFiber === null) {
				continue;
			}
			// 3. 判断是插入还是移动
			// 移动, 均为 [向右移动]
			// 判断的依据是: element.index与element对应的 current fiber 的index发生了变化
			//  - 如果接下来遍历到的可复用fiber的index < lastPlacedIndex, 则标记Placement
			//  - 否则不标记
			/*
        A B C -> B C A
        0 1 2    0 1 2
        对于A节点, 索引值从 0 -> 2, 代表更新之后, 它往右移动了
        当遍历 element时, 当前遍历到的element 一定是 所有已遍历的element中 最靠右的那个(比如上面的B C A,  处理B的时候B最靠右, 处理C的时候C最靠右, 因为C在B的右边, A同理)
        所以只需要记录最后一个可复用fiber在current中的index(lastPlacedIndex), 在接下来的遍历中
        上述例子中, 第一个lastPlacedIndex是0, 为初始值， B.index为1, 1 > 0, 因此不需要移动, 更新lastPlacedIndex为了1
        到了C则index变成2, 因为C也可以复用, 此时需要用C的index也就是2和1进行比较
        由于2 > 1, 说明C不移动, 不需要标记Placement, 更新lastPlacedIndex为2
        到了A, 此时index为0, 但是lastPlacedIndex为了2, 0 < 2, 说明A需要移动, 需要标记Placement
        其实从上面看, 只需要把A移动到了最后一个位置, 也就是C的位置, 就可以完成最少的移动(其实利用的是相对为止, 因为C相对于B始终没有发生变化)
      */

			newFiber.index = i;
			newFiber.return = returnFiber;
			if (lastNewFiber === null) {
				lastNewFiber = newFiber;
				firstNewFiber = newFiber;
			} else {
				lastNewFiber.sibling = newFiber;
				// 指向下一个新的fiber
				lastNewFiber = lastNewFiber.sibling;
			}

			if (!shouldTrackEffects) {
				// 无需追踪副作用
				continue;
			}
			const current = newFiber.alternate;
			if (current !== null) {
				const oldIndex = current.index;
				if (oldIndex < lastPlacedIndex) {
					// 需要移动(移动Placement)
					newFiber.flags |= Placement;
					continue;
				} else {
					// 不移动
					lastPlacedIndex = oldIndex;
				}
			} else {
				// 说明需要插入新节点(插入Placement)
				newFiber.flags |= Placement;
			}
		}
		// 4. 最后Map中剩下的都标记为删除
		existingChildren.forEach((child) => {
			// 都是需要删除的, 不能被复用
			deleteChild(returnFiber, child);
		});
		return firstNewFiber;
	}

	// 判断是否可复用
	function updateFromMap(
		returnFiber: FiberNode,
		existingChildren: ExistingChildren,
		index: number,
		element: any
	): FiberNode | null {
		const keyToUse = element.key !== null ? element.key : index;
		const before = existingChildren.get(keyToUse); // 更新前的fiber
		if (typeof element === 'string' || typeof element === 'number') {
			// HostText
			if (before) {
				if (before.tag === HostText) {
					// 更新前后都是HostText, 直接复用
					existingChildren.delete(keyToUse);
					return useFiber(before, { content: element.toString() });
				}
			}
			// 不能复用, 创建一个HostText类型的Fiber
			return new FiberNode(HostText, { content: element.toString() }, null);
		}

		// ReactElement类型
		if (typeof element === 'object' && element !== null) {
			switch (element.$$typeof) {
				case REACT_ELEMENT_TYPE:
					if (before) {
						if (before.type === element.type) {
							// 可以复用
							existingChildren.delete(keyToUse);
							return useFiber(before, element.props);
						}
						// 创建一个新的
						return createFiberFromElement(element);
					}
					// TODO Fragment | Array
					if (Array.isArray(element) && __DEV__) {
						console.warn('暂未实现fragment类型的child');
					}
			}
		}
		return null;
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
		// 多节点情况: ul>li*3
		if (Array.isArray(newChild)) {
			// 处理多节点
			return reconcileChildrenArray(returnFiber, currentFiber, newChild);
		}

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
