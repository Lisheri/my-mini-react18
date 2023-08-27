import { ReactElement, REACT_ELEMENT_TYPE } from '@mini-react/shared';
import { createFiberFromElement, FiberNode } from './fiber';
import { Placement } from './fiberFlags';
import { HostText } from './workTags';

/**
 *
 * @param shouldTrackEffects 是否应该追踪副作用
 *  ? 在不追踪副作用的情况下, 就不会标记一些副作用的Placement 的 Flags
 *  ? 这个策略本质上是针对mount流程的, 只有在mount流程时, 才会存在插入大量的DOM节点, 而在update流程时, 只存在更新局部的节点
 * @return reconcileChildFibers 处理儿子fiber
 */
function createChildReconciler(shouldTrackEffects: boolean) {
	// 这里在外层函数处理参数差异, 在生成一个新的函数
	// + 按理来说不标记副作用以后, 是不会生成 Placement 标记的, 但实际上我们希望的是对根节点执行一次 Placement
	// + 但实际上在初始化的过程中, 也就是在 workLoop -> renderRoot -> prepareRefreshStack 时
	// + 会创建第一个 workInProgress, 也是 root.current, 也就是 hostRootFiber
	// + 意味着, 在更新过程中, 有一个节点同时存在 current 以及 workInProgress, 也就是挂载的根节点对应的fiber, 也就是 hostRootFiber
	// + 那么对应到这里的逻辑, 对于首屏渲染, 挂载的组件树(<App/>)所有fiber都会走到 mount 的逻辑中
	// + 对于 hostRootFiber, 就会走到 update 逻辑中, 他会被插入一个 Placement Flag, 通过这个 Placement Flag, 最终会执行一次 dom 插入操作
	// + 就会将离屏构建好的dom节点插入到dom树中

	function reconcileSingleElement(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		element: ReactElement
	): FiberNode {
		// TODO 核心在于根据 ReactElement创建一个Fiber, 然后返回

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
		// 与 reconcileSingleElement 类似
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
			return reconcileSingleTextNode(returnFiber, currentFiber, newChild);
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
