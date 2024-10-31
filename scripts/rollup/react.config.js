// react 包的打包配置
import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
// ? 用于为构建文件生成 package.json
import generatePackageJson from 'rollup-plugin-generate-package-json';

// module 为单独个包入口文件, 也就是index.ts
const { name, module } = getPackageJSON('react');
// react 源文件package.json路径
const pkgPath = resolvePkgPath(name);

// react 构建产物路径
const pkgDistPath = resolvePkgPath(name, true);

// 数组中每一项都是打包配置
export default [
  // react
  {
    input: `${pkgPath}/${module}`, // 入口
    output: {
      file: `${pkgDistPath}/index.js`,
      name: 'React',
      // 这里兼容 commonjs和esm的 方式
      format: 'umd'
    },
    plugins: [...getBaseRollupPlugins(), generatePackageJson({
      inputFolder: pkgPath,
      outputFolder: pkgDistPath,
      // 不能整体拷贝 package.json, 因为库文件开发时, 包对应的是 workspace下的包, 但是发包后, 并不是这样
      // 同时打包后的文件, 不应包含shared
      baseContents: ({name, description, version}) => ({
        name,
        description,
        version,
        main: 'index.js'
      })
    })]
  },
  {
    input: `${pkgPath}/src/jsx.ts`, // 入口
    output: [
      // jsx-runtime
      {
        file: `${pkgDistPath}/jsx-runtime.js`,
        name: 'jsx-runtime',
        format: 'umd'
      },
      // jsx-dev-runtime
      {
        file: `${pkgDistPath}/jsx-dev-runtime.js`,
        name: 'jsx-dev-runtime',
        format: 'umd'
      }
    ],
    plugins: getBaseRollupPlugins()
  }
];
