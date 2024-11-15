import { Props } from '@mini-react/shared';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_runWithPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { Container } from './hostConfig';

export const elementPropsKey = '__props';
// 当前支持的事件
const validEventTypeList = ['click'];

export interface DOMElement extends Element {
	[elementPropsKey]: Props;
}

type EventCallback = (e: Event) => void;

// 合成事件类型
interface SyntheticEvent extends Event {
	__stopPropagation: boolean; // 阻止事件传递（阻止冒泡）
}

export interface Paths {
	capture: EventCallback[];
	bubble: EventCallback[];
}

// dom[xxx] = reactElement.props[xxx]
// 在dom节点上保存props
export function updateFiberProps(node: DOMElement, props: Props) {
	// 保存所有的props
	node[elementPropsKey] = props;
}

export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn('当前不支持', eventType, '事件');
		return;
	}

	if (__DEV__) {
		console.info('初始化事件: ', eventType);
	}

	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

// 创建合成事件
function createSyntheticEvent(e: Event): SyntheticEvent {
	const syntheticEvent = e as SyntheticEvent;
	// 默认不阻止
	syntheticEvent.__stopPropagation = false;
	const originStopPropagation = e.stopPropagation;
	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			originStopPropagation.call(e);
		}
	};
	return syntheticEvent;
}

function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target as DOMElement;
	if (targetElement === null) {
		console.warn('事件不存在target', e);
		return;
	}
	// 1. 收集沿途事件(targetElement -> container中对应事件的回调)
	const { bubble, capture } = collectPaths(targetElement, container, eventType);
	// 2. 构造合成事件
	const se = createSyntheticEvent(e);
	// 3. 遍历 capture (捕获阶段)
	triggerEventFlow(capture, se);
	if (!se.__stopPropagation) {
		// 4. 如果没有阻止冒泡, 则继续遍历 bubble (冒泡阶段)
		triggerEventFlow(bubble, se);
	}
}

function triggerEventFlow(path: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < path.length; i++) {
		const eventCallback = path[i];
		// 触发事件
		// unstable_runWithPriority 的作用很简单, 就是将当前优先级设置到其作用域中的全局变量currentPriorityLevel中
		// 然后执行回调函数(在执行回调函数的上下文中, 可以通过 unstable_getCurrentPriorityLevel 获取当前正在处理的优先级)
		// 回调执行后, 在将优先级恢复为调用当前runWithPriority之前的优先级
		unstable_runWithPriority(eventTypeToSchedulerPriority(se.type), () => {
			eventCallback.call(null, se);
		});
		if (se.__stopPropagation) {
			// 这里如果是阻止冒泡, 则需要阻止事件继续传递
			break;
		}
	}
}

function getEventCallbackNameFromEventType(
	eventType: string
): string[] | undefined {
	return {
		// 第一个是捕获, 第二个是冒泡
		click: ['onClickCapture', 'onClick']
	}[eventType];
}

function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
): Paths {
	const paths: Paths = {
		capture: [],
		bubble: []
	};
	while (targetElement && targetElement !== container) {
		// 收集
		const elementProps = targetElement[elementPropsKey];
		if (elementProps) {
			const callbackNameList = getEventCallbackNameFromEventType(eventType);
			if (callbackNameList) {
				callbackNameList.forEach((callbackName, i) => {
					const eventCallback = elementProps[callbackName];
					if (eventCallback) {
						if (i === 0) {
							// capture(需要反向插入)
							paths.capture.unshift(eventCallback);
							/*
                <div onClick onClickCapture>
                  <div onClick onClickCapture>
                    targetElement: 
                    <p onClick></p>
                  </div>
                </div>

                针对上述结构, 第一个进去的是 p.onClick, 此时会push到
                bubble -> bubble: [p.onClick, div.onClick, container.onClick]
                capture -> capture: [container.onParentClick, div.onParentClick]
                对于 capture遍历阶段, 我们需要从上往下遍历执行, 模拟的捕获阶段事件回调触发, 因此反向插入便于后续处理
                而对于 bubble阶段, 则是由内向外触发, 因此正序插入即可, 这样遍历时, 就是正常的由内向外
              */
						} else {
							// bubble
							paths.bubble.push(eventCallback);
						}
					}
				});
			}
		}
		// 收集完成完成后, 继续往上收集(targetElement -> container中所有节点的回调事件)
		targetElement = targetElement.parentNode as DOMElement;
	}
	return paths;
}

// 根据不同的交互了类型设置不同的调度优先级
// ? 如果存在更多的情况, 直接调整即可
function eventTypeToSchedulerPriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			// 对于这样的输入事件, 我们认为是优先级最高的, 直接返回调度器的同步优先级
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
