// 暂时用于定义描述宿主环境

// 容器类型
export type Container = any;

// 模拟实现 createInstance 方法(在reconciler中的实现抽象层级应当更高)
// 这些方法应该是宿主环境对应的包中进行实现
export const createInstance = (...args: any[]) => {
	console.info(args);
	return {} as any;
};

// 将实例插入
export const appendInitialChild = (...args: any[]) => {
	console.info(args);
	return {} as any;
};

// 创建文本节点
export const createTextInstance = (...args: any[]) => {
	console.info(args);
	return {} as any;
};

// 将儿子插入到爹下面
export const appendChildToContainer = (...args: any[]) => {
	return args;
};
