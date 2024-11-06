import {
	ElementType,
	REACT_ELEMENT_TYPE,
	hasOwnProperty,
	REACT_FRAGMENT_TYPE
} from '@mini-react/shared';
import type { Type, Key, Ref, Props, ReactElement } from '@mini-react/shared';

// const RESERVED_PROPS = {
// 	key: true,
// 	ref: true,
// 	__self: true,
// 	__source: true
// };

// jsx 或者 createElement 执行的返回结果, 都是 ReactElement
/**
 * ReactElement 是一个和执行环境无关的数据结构, 因此他的类型定义应当在 shared 包中
 * @param type 节点的类型
 * @param key 组件的key
 * @param ref 组件的ref
 * @param props 组件的props
 */
const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref,
	props: Props
): ReactElement {
	const element = {
		// 通过 $$typeof 来指明当前对象是一个 ReactElement
		$$typeof: REACT_ELEMENT_TYPE,
		type,
		key,
		ref,
		props,
		__mark: 'Lisher'
	};
	return element;
};

// 后续所有参数都当做 children 处理
// jsx的核心主要是前置处理参数差异, 用于创建一个 ReactElement
// jsx方法返回的结果是一个 ReactElement 结构
/**
 *
 * @param type 节点的类型
 * @param config 配置项, key和ref这两个prop需要单独处理
 * @param mayBeChildren 儿子节点(可能不传, 所以命名为 mayBeChildren), babel静态编译的jsx方法, children实际上就在props中
 * @returns
 */
export const jsx = (
	type: ElementType,
	config: any,
	...mayBeChildren: any[]
): ReactElement => {
	// config 中有 key 和 ref需要单独处理
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;
	// 处理config上的属性, 均赋值给 props对象, 同时更新 key 和 ref
	for (const prop in config) {
		// 将所有的值赋值给 props对象
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = val + ''; // 转字符串赋值
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val; // 这个不转字符串
			}
			continue;
		}
		// 这里需要滤除原型上的属性以及前面的key和ref
		if (hasOwnProperty.call(config, prop)) {
			// 赋值给props
			props[prop] = val;
		}
	}
	const maybeChildrenLength = mayBeChildren.length;
	if (maybeChildrenLength) {
		// 只有一个 child, 还有一种是有多个 [child, child, child]
		if (maybeChildrenLength === 1) {
			// 只有一个child, 直接解开数组就行了
			props.children = mayBeChildren[0];
		} else {
			// children 本身
			props.children = mayBeChildren;
		}
	}

	return ReactElement(type, key, ref, props);
};

// 这里生成和开发都用这个
// ? 当然, 实际上并不是这样的, 因为在React中, 开发环境的jsx会做更多的检查
// ? 当前版本的react, 哪怕是开发环境 children 也没有放到 props中
export const jsxDEV = (type: ElementType, config: any): ReactElement => {
	// config 中有 key 和 ref需要单独处理
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;
	for (const prop in config) {
		// 将所有的值赋值给 props对象
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = val + ''; // 转字符串赋值
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val; // 这个不转字符串
			}
			continue;
		}
		// 这里需要滤除原型上的属性以及前面的key和ref
		if (hasOwnProperty.call(config, prop)) {
			// 赋值给props
			props[prop] = val;
		}
	}
	// const maybeChildrenLength = mayBeChildren.length;
	// if (maybeChildrenLength) {
	// 	// 只有一个 child, 还有一种是有多个 [child, child, child]
	// 	if (maybeChildrenLength === 1) {
	//     // 只有一个child, 直接解开数组就行了
	// 		props.children = mayBeChildren[0];
	// 	} else {
	// 		// children 本身
	// 		props.children = mayBeChildren;
	// 	}
	// }

	return ReactElement(type, key, ref, props);
};

export const Fragment = REACT_FRAGMENT_TYPE;

export function isValidElement(elm: any) {
	// 判断elm是否是一个合法的ReactElement
	return (
		typeof elm === 'object' &&
		elm !== null &&
		elm.$$typeof === REACT_ELEMENT_TYPE
	);
}
