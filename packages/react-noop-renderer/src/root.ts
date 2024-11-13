// ReactDOM.createRoot(root).render(<App/>)

import { createContainer, updateContainer } from '@mini-react/react-reconciler';
import {
	ReactElement,
	REACT_ELEMENT_TYPE,
	REACT_FRAGMENT_TYPE
} from '@mini-react/shared';
import { Container, Instance } from './hostConfig';
import * as Scheduler from 'scheduler';

let idContainer = 0;
export function createRoot() {
	const container: Container = {
		rootID: idContainer++,
		children: []
	};

	// 这是因为ts锁定的hostConfig, 指向的是react-dom, 因此这里会提示类型不匹配
	// 但是并不影响逻辑, 因此这里直接忽略ts报错
	// @ts-ignore
	const root = createContainer(container);

	function getChildren(parent: Container | Instance) {
		if (parent) {
			return parent.children;
		}
		return null;
	}

	const getChildrenAsJSX = (root: Container) => {
		const children = childToJSX(getChildren(root));
		if (Array.isArray(children)) {
			return {
				$$typeof: REACT_ELEMENT_TYPE,
				type: REACT_FRAGMENT_TYPE,
				key: null,
				ref: null,
				props: { children },
				__mark: 'Lisher'
			};
		}
		return children;
	};

	const childToJSX = (child: any) => {
		if (typeof child === 'string' || typeof child === 'number') {
			// 文本节点
			return child;
		}

		if (Array.isArray(child)) {
			// fragment
			if (!child.length) {
				return null;
			}
			if (child.length === 1) {
				return childToJSX(child[0]);
			}
			const children = child.map(childToJSX);
			if (
				children.every(
					(child) => typeof child === 'string' || typeof child === 'number'
				)
			) {
				return children.join('');
			}
			// [TextInstance, Instance, TextInstance, Instance]等情况
			return children;
		}

		// Instance
		if (Array.isArray(child.children)) {
			const instance = child as Instance;
			const children = instance.children.map(childToJSX);
			const props = instance.props;
			if (children !== null) {
				props.children = children;
			}

			return {
				$$typeof: REACT_ELEMENT_TYPE,
				type: instance.type,
				key: null,
				ref: null,
				props,
				__mark: 'Lisher'
			};
		}

		// textInstance
		return child.text;
	};

	return {
		_Scheduler: Scheduler,
		render(element: ReactElement) {
			return updateContainer(element, root);
		},
		getChildren() {
			return getChildren(container);
		},
		getChildrenAsJSX() {
			return getChildrenAsJSX(container);
		}
	};
}
