/*
  存放 fiber node 数据结构
*/
import type { Key, Props, ReactElement, Ref } from '@mini-react/shared';
import { Flags, NoFlags } from './fiberFlags';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	WorkTag
} from './workTags';

// 此处不能写死 hostConfig的路径, 因为 react-reconciler 下的 hostConfig 只是暂时实现
// 后续还需要做更多的扩展
import type { Container } from 'hostConfig';

export class FiberNode {
	// ? FiberNode的标签类型
	public tag: WorkTag;
	// ? FiberNode唯一键
	public key: Key;
	// ? 刚开始准备工作时的props
	public pendingProps: Props;
	// ? stateNode这个东西, 以 HostComponent为例, 比如div这个 HostComponent, 他的 stateNode 保留的就是 div这个DOM
	public stateNode: any;
	// ? fiberNode的类型, 比如 FunctionComponent, 他的tag是0, type就是 函数组件 本身: (props) => JSX
	public type: any;
	// * 指向父级fiberNode
	// ? FiberNode是作为工作单元, 当前单元结束后, 下一个就是他爹作为新的工作单元, 因此叫return(指向他爹FiberNode)
	public return: FiberNode | null;
	// ? 右边的兄弟fiberNode
	public sibling: FiberNode | null;
	// ? 儿子fiberNode
	public child: FiberNode | null;
	// ? 同级fiberNode有多个, 用于标识同级节点序号. 比如 ul>li*3, 里面li的FiberNode.index依次为 0 1 2
	public index: number;
	// ? ref属性
	public ref: Ref;
	// ? 工作完成后最终确定的props
	public memoizedProps: Props | null;
	// ? 更新完成的新的状态
	// * 在 FunctionComponent的FiberNode 中, 它指向其处理的 Hooks链表头结点
	public memoizedState: any;
	// ? 用于切换 current FiberNode 和 workInProgress FiberNode
	public alternate: FiberNode | null;
	// ? 副作用标记
	public flags: Flags;
	// ? 代表其子树中生成的flags, 在 completeWork中, 需要一层一层往上传递
	// ? 到顶层插入时, 可以在顶层获取到所有子树的flags
	public subTressFlags: Flags;

	// ? 更新队列, 此时并不知道state是什么类型, 因此使用unknow
	public updateQueue: unknown;

	// ? 所有需要删除的子节点集合
	public deletions: Array<FiberNode> | null = null;

	/**
	 *
	 * @param tag 节点标签
	 * @param pendingProps fiberNode接下来要更新的props
	 * @param key 节点唯一标识key
	 */
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// --------------------------- 作为实例属性 start ---------------------------
		this.tag = tag;
		this.key = key || null;
		this.stateNode = null;
		this.type = null;
		// --------------------------- 作为实例属性 end ---------------------------

		// --------------------------- 构成树状结构 start ---------------------------
		// 除了作为虚拟节点实例, 还需要一些字段, 用于表示节点间的关系
		// ? 叫 return 的原因在于, fiberNode是作为工作单元存在, 他工作完成后, 就指向他爹进行工作
		// ? 相当于return完成后, 他爹就开始工作了, 所以这里用return, 而不是father
		this.return = null;
		this.sibling = null;
		this.child = null;
		this.index = 0;
		this.ref = null;
		// --------------------------- 构成树状结构 end ---------------------------

		// --------------------------- 作为工作单元 start ---------------------------
		this.pendingProps = pendingProps;
		this.memoizedProps = null;
		// 在更新时, 会将 workInProgress 指向 current, 更新前将 current 指向 workInProgress
		this.alternate = null;

		// 更新队列
		this.updateQueue = null;
		this.memoizedState = null;
		// --------------------------- 作为工作单元 end ---------------------------

		// --------------------------- 副作用 start ---------------------------
		// flags统称为 副作用标记
		this.flags = NoFlags;
		// 子树flags
		this.subTressFlags = NoFlags;
		this.deletions = null;
		// --------------------------- 副作用 end ---------------------------
	}
}

// 应用入口对应的FiberNode
export class FiberRootNode {
	// ? 对应宿主环境的挂载点, 也就是 rootElement, 使用中常用的 <div id="app"></div>
	// ? 不过这里并不能直接设置为DOM Element, 而是应该采用更抽象的类型, 因为React并不仅是为web端服务
	public container: Container;

	// ? 指向 hostRootFiber, 也是一个 FiberNode
	public current: FiberNode;
	// ? 指向更新完成后的 hostRootFiber(递归更新完成)
	public finishedWork: FiberNode | null;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		// hostRootFiber 通过 stateNode 与 FiberRootNode 建立连接
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
	}
}

// 由于React采用的是双缓冲机制
// 因此, 这里要切换, 如果传入的是current, 那么返回的是 workInProgress. 而接收的是 workInProgress, 那么返回的是 current
// 这里表示的就是双缓存机制中, 每次都获取和当前fiberNode相对应的另外一个fiberNode
export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	// workInProgress 简写
	let wip = current.alternate;
	if (wip === null) {
		// 首屏渲染 workInProgress 为 null, 更新时才会存在
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		// alternate用于连接 current 与 workInProgress
		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		// 更新 pendingProps
		wip.pendingProps = pendingProps;
		// 清除所有副作用相关, 因为他可能是上次更新遗留的
		wip.flags = NoFlags;
		wip.subTressFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	// 它使用 shared: {pending}, 主要利用相同的指针, 让 current和wip都可以修改同一个pending内部内容
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;
	return wip;
};

export function createFiberFromElement(element: ReactElement): FiberNode {
	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent; // 默认是当前文件的类型
	if (typeof type === 'string') {
		// 对于<div></div> 来说, 他的type就是string类型的 div
		// 此时应该将他的fiberTag改成 HostComponent
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		// 边界情况
		console.warn('未定义的type类型', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	// 对于函数组件来说, 这个type就是组件本身的执行函数
	fiber.type = type;
	return fiber;
}

export function createFiberFromFragment(elements: any[], key: Key): FiberNode {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}
