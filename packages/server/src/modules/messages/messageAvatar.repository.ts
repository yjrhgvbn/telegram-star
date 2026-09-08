import { db } from "../../db/index.js";

export async function findMessageAvatarSource(id: number) {
  return db.message.findUnique({
    where: { id },
    select: { chatId: true },
  });
}
