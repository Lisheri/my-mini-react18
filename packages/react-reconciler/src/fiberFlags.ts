// 每个flags占一个位
export type Flags = number;

export const NoFlags = 0b0000001;

// 结构相关(beginWork阶段生成)
export const Placement = 0b0000010;

// 属性相关
export const Update = 0b0000100; // 更新属性

// 结构相关(beginWork阶段生成)
export const ChildDeletion = 0b0001000; // 删除子节点

// 当前flags中包含了 MutationMask, 说明有如下操作
export const MutationMask = Placement | Update | ChildDeletion;
