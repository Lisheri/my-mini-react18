import path from 'path';
import fs from 'fs';

import ts from 'rollup-plugin-typescript2';
import cjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';


// 所有包的路径, 其实就是 packages
const pkgPath = path.resolve(__dirname, '../../packages');
// 打出来的包按规范应该在 node_modules 中
const distPath = path.resolve(__dirname, '../../dist/node_modules');

export const resolvePkgPath = (pkgName, isDist = false) => {
  // 首先判断是否为 dist路径
  if (isDist) {
    // 返回 构建文件下的对应包名即可
    return `${distPath}/${pkgName}`;
  }
  return `${pkgPath}/${pkgName}`;
};

// 获取对应的 package.json 的配置
export const getPackageJSON = (pkgName) => {
  // 获取包对应的package.json文件
  const path = `${resolvePkgPath(pkgName)}/package.json`;
  // 将package.json读取为字符串
  const str = fs.readFileSync(path, { encoding: 'utf8'});

  return JSON.parse(str);
};

// 获取所有基础的 plugins
// ? 暂时需要两个, 一个是解析commonjs规范, 一个用于转译ts
export const getBaseRollupPlugins = ({
  // 插入环境标识
  alias = {
    __DEV__: true
  },
  typescript = {}
} = {}) => {
  console.info(alias)
  // 返回基本的 plugins
  // 先执行 commonjs的, 在执行ts的
  return [replace({ ...alias, preventAssignment: true }), cjs(), ts(typescript)]
}
