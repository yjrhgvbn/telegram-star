interface SenderPeer {
  className?: string;
  userId?: unknown;
}

interface SenderMessage {
  className?: string;
  fromId?: SenderPeer | null;
  peerId?: SenderPeer | null;
  sender?: { className?: string; id?: unknown } | null;
  out?: boolean;
  post?: boolean;
}

function getUserId(value: unknown): string | null {
  // 不让已丢失精度的 JS number 变成另一位用户的 ID。
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  const id = String(value ?? "");
  if (!/^[1-9]\d*$/.test(id)) return null;
  return BigInt(id) <= 9_223_372_036_854_775_807n ? id : null;
}

/** 同步读取当前发送者身份；不请求用户实体，也不采用转发原作者或匿名署名。 */
export function getSenderUserId(message: SenderMessage | null | undefined): string | null {
  if (!message) return null;

  // 显式 peer 的类型最可信：频道/群组的数字 ID 不能当作用户 ID。
  if (message.fromId != null) {
    return message.fromId.className === "PeerUser" ? getUserId(message.fromId.userId) : null;
  }
  if (message.post) return null;

  if (message.sender?.className === "User") return getUserId(message.sender.id);

  // TL 的 out flag 缺省代表 false；普通对象必须明确标记 incoming 才推断私聊对方。
  const incoming = message.out === false || (message.className === "Message" && message.out === undefined);
  return incoming && message.peerId?.className === "PeerUser"
    ? getUserId(message.peerId.userId)
    : null;
}
