// "归" 的过程
// 主要做两件事情: 1. 对于Host类型fiberNode, 构建离屏DOM树 2. 标记 Update flag
// ? 为什么是在归的阶段构建离屏DOM树?
//    + 因为归的阶段是从下往上的, 可以获取到最深层的子节点

import {
	Container,
	appendInitialChild,
	createInstance,
	createTextInstance
} from 'hostConfig';
import { FiberNode } from './fiber';
import { HostComponent, HostRoot, HostText } from './workTags';
import { NoFlags } from './fiberFlags';

// 递阶段所有fiberNode已经创建完成
// + 同时在往上的过程中, 可以将子节点插入到他爹身上, 依次往上, 离屏DOM Tree就构建完成了
export const completeWork = (wip: FiberNode) => {
	// 递归中的归阶段
	const newProps = wip.pendingProps;
	const current = wip.alternate;

	// 和 beginWork 类似, 根据不同的type, 来区分
	switch (wip.tag) {
		case HostComponent:
			if (current !== null && wip.stateNode) {
				// TODO update
				// 此时 stateNode中保存的就是上一次的DOM节点, 因此这个情况其实就是 "update"
			} else {
				// mount
				// 1. 构建DOM
				// ? 通过 调用 createInstance 创建宿主环境的实例
				// * reconciler的抽象层级是更高的, 它并不关注宿主环境创建如何实现, 只需要调用createInstance生成宿主环境节点实例即可
				// * 在构建时, 可以根据不同的宿主环境, 实现不同的createInstance, 就可以实现不同环境的节点创建逻辑
				// * 但是他们对应的reconciler只有这一套
				// * 对于浏览器, 就是dom节点, 后续均使用dom模拟
				// ? 由于当前处于 completeWork中, 说明当前创建的这个DOM, 是这个DOM树中最上面的一个
				// ? 因此需要将剩下的离屏DOM树 wip, 挂载到创建的dom, 也就是instance节点下
				const instance = createInstance(wip.type!, newProps);
				// 2. 将DOM插入到DOM树中
				appendAllChildren(instance, wip);
				// ? 挂载完成后, 将instance 赋值给 stateNode
				// 此时的instance已经完成挂载
				wip.stateNode = instance;
			}
			// 收集flags
			bubbleProperties(wip);
			return null;
		case HostText:
			// * 对于HostText来说, 流程几乎和HostComponent类似, 只不过是调用 createTextInstance
			if (current !== null && wip.stateNode) {
				// TODO update
				// 此时 stateNode中保存的就是上一次的DOM节点, 因此这个情况其实就是 "update"
			} else {
				// mount
				// 1. 构建DOM
				// ? 创建文本节点即可
				const instance = createTextInstance(newProps.content);
				// ? 由于文本节点没有儿子, 因此不需要考虑appendChild的问题, wip.stateNode就是当前节点实例instance
				wip.stateNode = instance;
			}
			// 收集flags
			bubbleProperties(wip);
			return null;
		case HostRoot:
			bubbleProperties(wip);
			return null;
		default:
			// 没有tag肯定是有问题的
			if (__DEV__) {
				console.warn('未处理的completeWork情况', wip);
			}
			return null;
	}
};

// 利用此法来将实例(web环境下是DOM实例)插入到树中
// 该方法实现的难点在于需要剔除组件标签(比如说组件A 为 const A = () => <div></div>), 插入的应该是div, 而不是A
// ? 这里核心工作就是在 parent这个节点下插入 workInProgress 节点
// ? 但是 wip 可能不是一个DOM节点, 因此需要递归寻找其中的HostComponent或者HostText节点
// ? 因此首先找儿子, 如果找到了, 则执行 appendInitialChild操作
// ? 如果没有找到, 就继续往下找
// ? 如果往下到头了, 则从最底下开始, 处理兄弟
// ? 兄弟处理完成后, 就往上找
// ? 整个流程其实和更新流程一样, 是一个递归的过程
function appendAllChildren(parent: Container, wip: FiberNode) {
	let node = wip.child;
	// 需要应对更加复杂的情况, 比如说A是一个Fragment, 因此需要循环处理, 直到node为null, 或者node为wip了
	while (node !== null) {
		// 由于node可能会有很多兄弟节点, 不一定是一个单节点
		if (node.tag === HostComponent || node.tag === HostText) {
			// 在parent下插入 node.stateNode
			appendInitialChild(parent, node.stateNode);
		} else if (node.child !== null) {
			// 当前节点没有儿子, 也是结束标识, 往上走处理爹那一层
			node.child.return = node;
			node = node.child;
			continue;
		}

		if (node === wip) {
			return;
		}

		// 往下到头了, 到此处开始处理兄弟, 并且一直往上找
		while (node.sibling === null) {
			if (node.return === null || node.return === wip) {
				// 此时已经回到了原点, 也应该结束了
				return;
			}
			// 否则递归往上
			node = node?.return;
		}
		// ? 兄弟节点和自己是同一个爹
		node.sibling.return = node.return;
		// ? 继续处理兄弟
		node = node.sibling;
	}
}

// 在生成 wip fiberNode树之后
// 还需要找到节点中被标记副作用flag的节点
// 此时需要找到这些节点, 但如果在生成完FiberNode Tree后, 再从上往下遍历(重走DFS), 这样对内存和性能的消耗是巨大的
// 因此采用在往上"归" 的过程中, 完成对fiberNode Tree flags的收集
function bubbleProperties(wip: FiberNode) {
	let subTreeFlags = NoFlags; // 用于收集归阶段所有的flags
	let child = wip.child;
	while (child !== null) {
		// 直接基于按位或的方式, 将 child的subTreeFlags附加在subTreeFlags中
		// * subTreeFlags中将包含当前节点的子节点的subTreeFlags以及child本身的flags
		subTreeFlags |= child.subTressFlags;
		subTreeFlags |= child.flags;
		// 处理其他兄弟
		child.return = wip;
		child = child.sibling;
	}
	// ? 这一层遍历完成后, 则将当前这一层节点所有的 flags以及subTreeFlags, 就全部放在当前wip的subTreeFlags中了
	// ? 在跟随completeWork继续往上遍历的过程中, 每一层都会进行收集所有的subTreeFlags
	// ? 这样到最顶层时, 根据flags和subTreeFlags就可以知道子树中是否存在插入|移动|删除|更新等
	wip.subTressFlags |= subTreeFlags;
}
