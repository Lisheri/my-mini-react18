// react-noop-renderer 是一个和宿主环境无关的环境测试包, 用于测试react的核心逻辑

import {
	FiberNode,
	HostComponent,
	HostText
} from '@mini-react/react-reconciler';
import { Props } from '@mini-react/shared';

// 在ReactDOM宿主环境的原生节点是DOM节点, 在Noop-Renderer宿主环境包括三类节点:

// 对应的是 HostRoot
export interface Container {
	rootID: number; // hostRoot对应的id
	children: (Instance | TextInstance)[];
}
// Instance(HostComponent)
export interface Instance {
	id: number;
	type: string;
	children: (Instance | TextInstance)[];
	parent: number; // 指向的父节点的id
	props: Props;
}
// 对应的是 HostText
export interface TextInstance {
	text: string;
	id: number;
	parent: number; // 指向的父节点的id
}

let instanceContainer = 0;
export const createInstance = (type: string, props: any): Instance => {
	const Instance = {
		id: instanceContainer++,
		type,
		children: [],
		parent: -1,
		props
	};
	return Instance;
};

// 将实例插入
export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
): void => {
	const prevParentID = child.parent;
	const parentID = 'rootID' in parent ? parent.rootID : parent.id; // 存在rootID, 则是一个container, 否则是instance
	// 不等于-1代表child已经有父节点了
	if (prevParentID !== -1 && prevParentID !== parentID) {
		// 这里表示执行重复的插入操作
		throw new Error('不能重复挂载child');
	}
	child.parent = parentID;
	parent.children.push(child);
};

// 创建文本节点
export const createTextInstance = (content: string) => {
	const instance: TextInstance = {
		text: content,
		id: instanceContainer++,
		parent: -1
	};
	return instance;
};

// 将儿子插入到爹下面
export const appendChildToContainer = (
	parent: Container,
	child: Instance
): void => {
	const prevParentID = child.parent;
	// 不等于-1代表child已经有父节点了
	if (prevParentID !== -1 && prevParentID !== parent.rootID) {
		// 这里表示执行重复的插入操作
		throw new Error('不能重复挂载child');
	}
	child.parent = parent.rootID;
	parent.children.push(child);
};

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
	textInstance.text = content;
}

// 删除节点
export function removeChild(
	child: Instance | TextInstance,
	container: Container
) {
	const idx = container.children.indexOf(child);
	if (idx === -1) {
		throw new Error('删除的节点不存在');
	} else {
		container.children.splice(idx, 1);
	}
}

export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	// 往前插入
	const beforeIdx = container.children.indexOf(before);
	if (beforeIdx === -1) {
		throw new Error('before不存在!');
	}
	const idx = container.children.indexOf(child);
	if (idx !== -1) {
		// 代表需要插入的节点已经在container下了, 需要先移除
		container.children.splice(idx, 1);
	}
	container.children.splice(beforeIdx, 0, child);
}

// 调度逻辑是和宿主环境相关的, 因此应该在宿主环境中实现
// 如果支持 queueMicrotask, 则直接通过 queueMicrotask构造微任务
export const scheduleMicroTask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
		? (callback: (...args: any) => void) => Promise.resolve().then(callback)
		: // 优雅降级, 都不支持, 则使用 setTimeout
		  setTimeout;
