// tag 就是标识 fiberNode 是什么类型的节点, 比如FunctionComponent, HostRoot(项目挂载的根节点)
export const FunctionComponent = 0;
export const HostRoot = 3; // ReactDom.render对应的类型, 就是HostRoot
export const HostComponent = 5; // 随意一个节点对应的tag类型, 比如div
export const HostText = 6; // 节点下的文本（纯文本）
export const Fragment = 7; // fragment类型

// workType
export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostText
	| typeof HostComponent
	| typeof Fragment;
