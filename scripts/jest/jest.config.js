// jest初始配置
const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	// 执行路径, process.cwd代表当前执行脚本命令的路径
	rootDir: process.cwd(),
	// 忽略的文件
	modulePathIgnorePatterns: ['<rootDir>/.history'],
	// 第三方依赖包解析dir
	moduleDirectories: [
		// 对于 React ReactDOM
		'dist/node_modules',
		// 其他第三方依赖
		...defaults.moduleDirectories
	],
	testEnvironment: 'jsdom',
	transform: {
    // 需要配合swcrc使用
		'^.+\\.(t|j)sx?$': '@swc/jest'
	}
};
