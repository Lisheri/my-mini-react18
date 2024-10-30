# FunctionComponent

FunctionComponent需要考虑的问题:
+ 如何像支持`HostRoot`, `HostComponent` 以及 `HostText` 一样支持`FC`
+ 如何在FC内部组织Hooks这样的逻辑

## 如何支持FC？
FC的工作同样根植于:
+ beginWork
+ completeWork

## 第二种调试方式

采用vite的实时调试, 好处是可以实时看到源码的运行效果

> 但是对于实际项目中的运行, 不如构建调试, 可能会产生一些差异性

## useState

> hooks是不能脱离FC上下文的, 一旦脱离他们仅仅只是个普通函数, 因此他们需要上下文的感知能力

### 感知上下文

比如说
+ hook如何知道在另一个hook的上下文环境内执行?
```tsx
function App() {
  useEffect(() => {
    const [state] = useState(0)
  })
}
```
+ hook怎么指到当前是在mount还是在update?

#### 方案

在不同上下文中调用的hook不是同一个函数

意味着对于不同的生成周期阶段, 需要实现不同的hooks集合

比如说在mount时, 有一个集合包含了所有的hooks, 而更新阶段, 又有另一个集合, 同样包含所有的hooks, 他们只是名字一样罢了

而这些hook的调用, 都是通过 `Reconciler` 来调度的

但实际上useState来自于React包, 因此我们需要跨越Reconciler, 最终到达react

因此需要在不同包之间共享context, 因此需要有一个`内部数据共享层`, 在这里实现`当前阶段使用的hooks集合`

当reconciler执行时, 在不同时期就可以将`当前使用的hooks集合`指向`当前时期的hooks集合`, 实现不同时期使用不同hooks

而在 `react` 中实际调用的, 也就是当前时期的 `hooks`集合, 而非单一的 `hooks实现`

## 数据共享层(currentDispatcher)

## update增加优先级调度(schedule阶段)
