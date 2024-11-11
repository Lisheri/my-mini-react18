import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import replace from '@rollup/plugin-replace';
import { resolvePkgPath } from '../rollup/utils';
import path from 'path';

// vite的插件体系和rollup是兼容的, 但是webpack不是
export default defineConfig({
	plugins: [react(), replace({ __DEV__: true, preventAssignment: true })],
	// 希望能直接引入packages下的react, 因此这里需要解析模块路径
	resolve: {
		alias: [
			{
				find: 'react',
				replacement: resolvePkgPath('react')
			},
			{
				find: 'react-dom',
				replacement: resolvePkgPath('react-dom')
			},
			{
				find: 'hostConfig',
				replacement: path.resolve(
					resolvePkgPath('react-dom'),
					'./src/hostConfig.ts'
				)
			}
		]
	},
	build: {
		sourcemap: 'inline'
	},
	server: {
		port: 6767
	}
});
