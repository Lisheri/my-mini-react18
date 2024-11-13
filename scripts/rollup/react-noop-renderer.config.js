// react 包的打包配置
import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
// ? 用于为构建文件生成 package.json
import generatePackageJson from 'rollup-plugin-generate-package-json';
import alias from '@rollup/plugin-alias';
// import typescript from 'rollup-plugin-typescript2';
import path from 'path';

// module 为单独个包入口文件, 也就是index.ts
const { name, module, peerDependencies } = getPackageJSON(
	'react-noop-renderer'
);
// react-noop-renderer 源文件package.json路径
const pkgPath = resolvePkgPath(name);

// react-noop-renderer 构建产物路径
const pkgDistPath = resolvePkgPath(name, true);

const basePlugins = getBaseRollupPlugins({
	typescript: {
    exclude: ['./packages/react-dom/**/*'],
		tsconfigOverride: {
			compilerOptions: {
				baseUrl: path.resolve(pkgPath, '../'),
				paths: {
					hostConfig: [`./${name}/src/hostConfig.ts`]
				}
			}
		}
	}
});

// 数组中每一项都是打包配置
export default [
	// react-noop-renderer
	{
		input: `${pkgPath}/${module}`, // 入口
		// 兼容原版导出, 18以后是走ReactDOM/client
		output: [
			{
				file: `${pkgDistPath}/index.js`,
				name: 'ReactNoopRenderer',
				// 这里兼容 commonjs和esm的 方式
				format: 'umd'
			}
		],
		external: [...Object.keys(peerDependencies)],
		plugins: [
			...basePlugins,
			// typescript({
			// 	tsconfig: ['./tsconfig.json'],
			// 	// 排除所有react-dom相关的逻辑
			// 	exclude: ['./packages/react-dom/**/*'],
			// 	tsconfigOverride: {
			// 		compilerOptions: {
			// 			paths: {
			// 				// 重写hostConfig位置
			// 				hostConfig: [`./${name}/src/hostConfig.ts`]
			// 			}
			// 		}
			// 	}
			// }),
			alias({
				entries: {
					// entries中key对应需要替换的包名
					hostConfig: `${pkgPath}/src/hostConfig.ts`
				}
			}),
			generatePackageJson({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				// 不能整体拷贝 package.json, 因为库文件开发时, 包对应的是 workspace下的包, 但是发包后, 并不是这样
				// 同时打包后的文件, 不应包含shared
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					peerDependencies: {
						// 一般来说react的version和react-noop-renderer的version是一致的
						react: version
					},
					main: 'index.js'
				})
			})
		]
	}
];
