/**
 * 公开入口：从 telegram/ 子目录统一转发所有导出。
 * 路由层保持 import from "…/services/telegram.js" 不变，
 * 内部实现已按职责拆分至 telegram/ 下各模块。
 */
export * from "./telegram/index.js";
