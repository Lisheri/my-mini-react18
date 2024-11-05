// 用于定义描述DOM宿主环境的api

import {
	FiberNode,
	HostComponent,
	HostText
} from '@mini-react/react-reconciler';
import { DOMElement, updateFiberProps } from './SyntheticEvent';

// 容器类型
export type Container = Element;
export type Instance = Element;
export type TextInstance = Text;

export const createInstance = (type: string, props: any): Instance => {
	const element = document.createElement(type) as unknown;
	// 处理props
	updateFiberProps(element as DOMElement, props);
	return element as Instance;
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

export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText:
			const text = fiber.memoizedProps.content;
			return commitTextUpdate(fiber.stateNode, text);
		case HostComponent:
			// update fiber props
			// updateFiberProps(fiber.stateNode as DOMElement, fiber.memoizedProps);
			return;
		default:
			if (__DEV__) {
				console.warn('未实现的Update类型', fiber);
			}
			break;
	}
}

// 实现text类型节点的更新
export function commitTextUpdate(textInstance: TextInstance, content: string) {
	textInstance.textContent = content;
}

// 删除节点
export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	container.removeChild(child);
}
