// 用于定义描述DOM宿主环境的api

// 容器类型
export type Container = Element;
export type Instance = Element;

export const createInstance = (type: string, props: any): Instance => {
	const element = document.createElement(type);
	// TODO 处理props
	console.info(props);
	return element;
};

// 将实例插入
export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
): void => {
	parent.appendChild(child);
};

// 创建文本节点
export const createTextInstance = (content: string) => {
	return document.createTextNode(content);
};

// 将儿子插入到爹下面
// TODO 暂时直接使用 appendInitialChild
export const appendChildToContainer = appendInitialChild;
