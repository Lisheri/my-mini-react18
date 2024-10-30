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

## reconcile

## update增加优先级调度(schedule阶段)
