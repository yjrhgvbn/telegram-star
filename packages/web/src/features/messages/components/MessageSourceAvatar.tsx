import { useState } from "react";
import { getMessageAvatarUrl } from "@/shared/api/url";

/** The source avatar matches the adjacent chat title. Loading never changes
 * the row's dimensions; unavailable Telegram photos retain a quiet fallback. */
export function MessageSourceAvatar({ messageId, source }: { messageId: number; source: string }) {
  const src = getMessageAvatarUrl(messageId);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span className="message-card__avatar" aria-hidden="true">
      {Array.from(source).slice(0, 2).join("")}
      {failedSrc !== src && <img
        key={src}
        src={src}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className={loadedSrc === src ? "message-card__avatar-image is-loaded" : "message-card__avatar-image"}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
      />}
    </span>
  );
}
