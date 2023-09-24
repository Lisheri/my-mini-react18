// 聚合打包器
import reactDomConfig from './react-dom.config';
import reactConfig from './react.config';

export default () => {
	return [...reactDomConfig, ...reactConfig];
};
