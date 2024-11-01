// 测试环境
import type { ReactElement } from '@mini-react/shared';
// @ts-ignore
import { createRoot } from 'react-dom';
export function renderIntoDocument(element: ReactElement) {
	const div = document.createElement('div');
	return createRoot(div).render(element);
}
