# reconciler

> reconciler 是 react 的核心模块, 翻译过来叫"协调器", 就是 diff 算法的意思

## reconciler 作用

### 过程驱动

在 jq 时代, 视图的更新都是`过程驱动`, 模式如下：

jQuery -> 调用宿主环境 API -> 更新视图 -> 显示最新的 UI

### 状态驱动

而从 angular 以后, 前端框架基本工作原理均变成了`状态驱动`:

UI 描述方法(jsx|template 等) -> 编译后 -> 运行时核心模块(reconciler(react)|renderer(vue)) -> 调用宿主环境 API -> 更新视图 -> 显示最新的 UI

1. 消费 JSX
2. 没有编译优化(react 没有, 直接转换 jsx 为 render 函数, vue, sevelet, solid 等是存在编译优化的)
3. 开放通用的 API 提供不同的宿主环境使用

## reconciler 消费 JSX 的过程

### reconciler 操作的数据结构

当前已知的数据结构: `ReactElement`

```ts
export interface ReactElement {
	$$typeof: symbol | number;
	type: ElementType;
	key: Key;
	ref: Ref;
	props: Props;
	__mark: string;
}
```

但是 ReactElement 如果直接作为 reconciler 操作的数据结构, 会存在如下问题

- 无法表达节点之间的关系
- 字段有限, 不好扩展(比如无法表达状态)

因此, 需要一种全新的数据结构, 特点如下:

- 介于 ReactElement 与真实 UI 节点之间
- 能够表达节点之间的关系
- 方便拓展(不仅作为数据存储单元, 也能作为工作单元)

上述数据结构, 其实就是 `FiberNode`(VirtualDOM 在 React 中的实现)

### FiberNode

```ts
class FiberNode {
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
	// ? FiberNode是作为工作单元, 当前单元结束后, 下一个就是他爹作为新的工作单元, 因此叫return
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

	/**
	 *
	 * @param tag 节点标签
	 * @param pendingProps fiberNode接下来要更新的props
	 * @param key 节点唯一标识key
	 */
	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// --------------------------- 作为实例属性 start ---------------------------
		this.tag = tag;
		this.key = key;
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
		// flags统称为 副作用标记
		this.flags = NoFlags;
		// 子树flags
		this.subTressFlags = NoFlags;
		// 更新队列
		this.updateQueue = null;
		this.memoizedState = null;
		// --------------------------- 作为工作单元 end ---------------------------
	}
}
```

## reconciler的工作方式

对于同一个节点, 比较其`ReactElement`与`fiberNode`, 生成`子fiberNode`。

并根据比较的结果生成不同标记(插入、删除、移动等), 对应不同宿主环境API的执行

例:
1. 挂载`<div></div>`
```ts
// ReactElement <div></div>
jsx("div")
// 此时对应的 fiberNode
null
// 生成的 子fiberNode

// 对应的标记
Placement; // 插入
```

2. 将`<div></div>`更新为了`<p></p>`

```ts
// ReactElement <p></p>
jsx("p")
// 对应的 fiberNode
FiberNode { type: 'div' }
// 生成的 子fiberNode
// 对应的标记
Deletion Placement; // 先删除div, 后插入p
```

当所有的React Element比较完成后, 会生成一颗`fiberNode树`, 一共存在两棵 `fiberNode Tree`:
+ current: 与视图中真实UI对应的`fiberNode Tree`
+ workInProgress(WIP): 触发更新后, 正在reconciler中计算的 `fiberNode Tree`

> 上述fiberNode中的`alternate`就用于切换这两棵树, 当前是 current, alternate就指向 WIP, 当前是WIP, alternate就指向 current


## 双缓冲技术



## JSX消费的顺序

DFS(深度优先遍历) 对比 BFS(广度优先遍历)

react采用DFS遍历 ReactElement(自顶向下)
+ 如果有儿子, 遍历儿子
+ 如果没有儿子, 处理兄弟

例:

```html
<Card>
  <h3>你好</h3>
  <p>mini-react</p>
</Card>
```

上述过程是一个递归的过程, 拆分为 递、归两个阶段
+ 递: 对应 `beginWork`
+ 归: 对应 `completeWork`

