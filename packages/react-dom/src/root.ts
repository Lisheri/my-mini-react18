// ReactDOM.createRoot(root).render(<App/>)

import { createContainer, updateContainer } from '@mini-react/react-reconciler';
import { ReactElement } from '@mini-react/shared';
import { Container } from './hostConfig';
import { initEvent } from './SyntheticEvent';

export function createRoot(container: Container) {
	const root = createContainer(container);

	return {
		render(element: ReactElement) {
			// 测试 初始化事件
			initEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}
