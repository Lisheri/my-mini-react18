export type Flags = number;

export const NoFlags = 0b0000001;
// 结构相关(beginWork阶段生成)
export const Placement = 0b0000010;
// 属性相关
export const Update = 0b0000100;
// 结构相关(beginWork阶段生成)
export const ChildDeletion = 0b0001000;
