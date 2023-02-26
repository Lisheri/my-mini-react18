// react 包的打包配置
import { getPackageJSON, resolvePkgPath, getBaseRollupPlugins } from './utils';
// ? 用于为构建文件生成 package.json
import generatePackageJson from 'rollup-plugin-generate-package-json';

const { name, module } = getPackageJSON('react');
// react包的路径
const pkgPath = resolvePkgPath(name);

// react产物路径
const pkgDistPath = resolvePkgPath(name, true);

// 数组中每一项都是打包配置
export default [
  // react
  {
    input: `${pkgPath}/${module}`, // 入口
    output: {
      file: `${pkgDistPath}/index.js`,
      name: 'index.js',
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
        file: `${pkgDistPath}/js-runtime.js`,
        name: 'jsx-runtime.js',
        format: 'umd'
      },
      // jsx-dev-runtime
      {
        file: `${pkgDistPath}/js-dev-runtime.js`,
        name: 'js-dev-runtime.js',
        format: 'umd'
      }
    ],
    plugins: getBaseRollupPlugins()
  }
];
