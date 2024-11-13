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
		// 其他第三方依赖
		...defaults.moduleDirectories,
		// 对于 React ReactDOM
		'dist/node_modules'
	],
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		// 调整scheduler指向, 指向测试环境的mock, 专门为了并发环境测试准备
		'^scheduler$': '<rootDir>/node_modules/scheduler/unstable_mock.js',
		'^react$': '<rootDir>/dist/node_modules/react/index.js',
    '^react-noop-renderer$': '<rootDir>/dist/node_modules/react-noop-renderer/index.js',
	},
	// 假计时器
	fakeTimers: {
		enableGlobally: true,
		legacyFakeTimers: true
	},
	// 设置matchers目录
	setupFilesAfterEnv: ['./scripts/jest/setupJest.js'],
	transform: {
		// 需要配合swcrc使用
		'^.+\\.(t|j)sx?$': '@swc/jest'
	}
};
