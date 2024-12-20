// 每个flags占一个位
export type Flags = number;

export const NoFlags = 0b0000000;

// 结构相关(beginWork阶段生成)
export const Placement = 0b000001;

// 属性相关
export const Update = 0b0000010; // 更新属性

// 结构相关(beginWork阶段生成)
export const ChildDeletion = 0b0000100; // 删除子节点

export const PassiveEffect = 0b0001000; // 代表当前更新时, 当前fiber上存在需要触发useEffect的情况

// 当前flags中包含了 MutationMask, 说明有如下操作
export const MutationMask = Placement | Update | ChildDeletion;

// 原有判断是否commitPlacement逻辑为 flags & Placement) !== NoFlag
// 此时 flags & 2 !== 1, 但是收集完成的 flags 可能就是 NoFlags, 此时不应该进入操作, 但是 1 & 2 结果为了0 (01 & 10 -> 00)
// 并不符合判断, 因此会进入操作, 但与需求不符
// 最好的方式就是将所有的 flags都右移一位

// 直接参考MutationMask的实现, 实现一个 PassiveMask
// 如果在PassiveMask上存在 PassiveEffect, 就代表有了
// 还有一种情况就是, 函数组件卸载, 也就是存在 ChildDeletion, 需要触发 destroy 回调
export const PassiveMask = PassiveEffect | ChildDeletion; // 如果flags & PassiveMask !== NoFlags, 说明当前fiber上存在需要触发useEffect的情况
