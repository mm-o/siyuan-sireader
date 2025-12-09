/**
 * Foliate-js 集成模块
 * 完全基于 foliate-js 原生 API 实现
 */

export * from './types'
export * from './view'
export * from './mark'
export * from './reader'

// 默认导出
export { createReader, FoliateReader } from './reader'
