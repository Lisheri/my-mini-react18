# mount 时调用的 API

fiberReconciler 对外暴露两个函数

- createContainer
  - 当执行 ReactDOM.createRoot()之后, 其内部就会执行 createContainer 去创建 `fiberRootNode`以及`hostRootFiber`
- updateContainer
  - 当执行 render 方法之后, 其内部就会执行 updateContainer 触发首屏渲染, 并生成 App 对应的 `FiberNode`

## createContainer

```ts
function createContainer(container: Container): FiberRootNode {
	// 初始化hostRootFiber
	//  ReactDOM.createRoot传入的element对应的FiberNode类型, 就是HostRootFiber
	const hostRootFiber = new FiberNode(HostRoot, {}, null);
	// 初始化应用入口, 并且将 fiberRootNode与 hostRootFiber形成关联
	const root = new FiberRootNode(container, hostRootFiber);
	// 初始化hostRootFiber的updateQueue
	hostRootFiber.updateQueue = createUpdateQueue();
	return root; // 返回创建完的 fiberRootNode
}
```

## updateContainer

> 调用 render 方法时, 内部会触发 updateContainer, 完成首屏渲染
>
> render 接收了一个 `<App/>`, 是一个 ReactElement, 同样会交给 updateContainer 处理
>
> 同时内部还需要接收上面初始化的 root, 也就是 FiberRootNode

```ts
function updateContainer(
	element: ReactElement | null,
	root: FiberRootNode
): ReactElement {
	// 首先获取到 hostRootFiber, 正式通过fiberRootNode.current
	const hostRootFiber = root.current;
	// 首屏渲染触发更新, 首先需要先有一个 update 更新函数
	const update = createUpdate<ReactElement | null>(element); // 代表这次更新是和element相关的
	// 调用enqueueUpdate 插入update到更新队列中
	enqueueUpdate(
		hostRootFiber.updateQueue as UpdateQueue<ReactElement | null>,
		update
	);
	// 触发队列调度更新机制
	schedulerUpdateOnFiber(hostRootFiber);
	return element;
}
```

到此为止, 此时就已经实现了在`update`中最后所描述的两件事

1. 实现 mount 时调用的 API
2. 将 API 接入到更新机制中

接下来要做的事情, 是如何将 updateContainer, 也就是上述 update, 与 后续的`workLoop`中的`renderRoot` 连接上

其实就是基于上述实现中的 `schedulerUpdateOnFiber`, 这个方法专用于连接 Container 以及之后的 renderRoot 方法

> 名字直译过来就是在 Fiber 中调度 update
>
> 也是为以后实现的调度功能开放一个入口, 首屏渲染时无需关注调度功能, 仅需要串联 Container 与 renderRoot 这个工作

## schedulerUpdateOnFiber

```ts
function schedulerUpdateOnFiber(fiber: FiberNode) {
	// 对于首屏, 这个fiber是 hostRootFiber, 但是对于其他流程更新, 比如 setState调用
	// 那么这个fiber, 就是其他节点的fiber
	// 因此第一个事情, 就是向上查找根节点, 也就是 fiberRootNode
	const root = markUpdateFromFiberToRoot(fiber);
	// 调用 renderRoot
	renderRoot(root as FiberRootNode);
}
```

### markUpdateFromFiberToRoot

> 作用是从当前节点开始向上查找到根节点

```ts
const markUpdateFromFiberToRoot = (fiber: FiberNode): FiberRootNode | null => {
	let node = fiber;
	let parent = fiber.return;
	// 必须向上到顶
	while (parent !== null) {
		node = parent;
		parent = node.return;
	}
  // 找到的是hostRootFiber
  // 它的stateNode才对应的是 FiberRootNode
	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
};
```
