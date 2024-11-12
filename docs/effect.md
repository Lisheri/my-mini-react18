# effect

## 什么是effect?

```tsx
function App() {
  useEffect(() => {
    // create
    return () => {
      // destroy
    }
  }, [xxx, xxx])

  useLayoutEffect(() => {
    
  })

  useEffect(() => {
    
  }, [])
}
```

在react中一共存在三种副作用, 他们的触发时机不同(见下方)

## effect数据结构

> 所有的effect, 应该是共用一份effect数据结构, 因此这个数据结构应该能够指代所有的 effect

实现effect数据结构需要考虑如下一些事情：

+ 不同的effect可以共用同一个机制
  - useEffect
    + 触发时机: 依赖变化后的当前commit阶段完成后, 异步执行
  - useLayoutEffect
    + 触发时机: 依赖变化后当前commit阶段后同步执行
  - useInsertionEffect
    + 触发时机: 和useLayoutEffect一样, 区别在于在执行时拿不到dom的引用, 主要提供给`css in js`库使用
+ 需要能够保存依赖
  - 主要针对他的依赖变化, 需要重新执行回调, 因此需要保存依赖
+ 需要能保存create回调
  - effect执行时, 传入的回调函数
+ 需要能保存destroy回调
  - 传入的回调函数中存在的返回值, 如果是一个函数, 则是destroy回调, 会在组件销毁时统一触发
+ 需要能区分是否需要触发create回调
  - 对于一个useEffect来说, 即使函数组件更新时, effect回调不触发, 他的effect数据结构也是存在的, 需要保证函数组件hook链表的稳定, 因此需要在数据结构中进行区分是否触发回调
  - 一共有如下两个时机需要触发回调
    + mount时
    + 依赖变化时

> 数据结构如下
```tsx
const effect = {
  tag,
  create,
  destroy,
  deps,
  next
}
```

## 新增三个flag用于确定是否需要触发回调

+ 对于fiber, 新增 PassiveEffect, 代表「当前fiber在本次更新存在副作用」
+ 对于effect hook, Passive代表「useEffect对应effect」
+ 对于effect hook, HookHasEffect代表「当前effect本次更新存在副作用」


## 工作流程

1. 在 render 阶段, 发现当前 FC FiberNode 存在 effect(也就是PassiveEffect)
2. 在 commit 阶段 调度副作用(因为 useEffect 的执行是异步的), 然后收集副作用回调
3. 收集完成后, 当经过commit阶段, 则异步执行副作用


## 调度副作用
调度需要使用 `Scheduler(调度器)`, 调度器也属于React项目下的模块。

这里使用第三方调度器

```shell
pnpm i -w scheduler
pnpm i -D -w @types/scheduler
```



