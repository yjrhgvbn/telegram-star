import type { Prisma } from "../../generated/prisma/client.js";
import { db } from "../../db/index.js";

/** Prisma 组合唯一键冲突表示该 Telegram 消息已被实时监听或回补链路保存。 */
export function isDuplicateMessageError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

/**
 * 依赖数据库唯一键执行原子防重。相比“先查询再创建”，该方式可以安全处理
 * 实时监听、自动回补和手动历史同步之间的并发竞争。
 */
export async function createMessageIfAbsent(
  data: Prisma.MessageCreateArgs["data"],
): Promise<number | null> {
  try {
    const created = await db.message.create({ data, select: { id: true } });
    return created.id;
  } catch (error) {
    if (isDuplicateMessageError(error)) return null;
    throw error;
  }
}
