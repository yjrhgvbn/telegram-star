import { useState, useRef, useEffect } from "react";
import {
  Image,
  Video,
  FileText,
  Mic,
  Music,
  MapPin,
  BarChart3,
  User,
  Play,
  Sticker,
} from "lucide-react";
import type { Message } from "../types";

interface Props {
  message: Message;
}

/** 格式化文件大小 */
function formatSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 格式化时长 */
function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 解析 mediaExtra JSON 安全地 */
function parseExtra(extra: string | null): Record<string, unknown> {
  if (!extra) return {};
  try {
    return JSON.parse(extra);
  } catch {
    return {};
  }
}

/**
 * 图片缩略图：stripped base64 占位 → 代理清晰缩略图懒加载渐进替换。
 * 使用 IntersectionObserver 控制可见时才加载。
 */
function PhotoPreview({ message }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const thumbSrc = `/api/media/${message.chatId}/${message.telegramMessageId}/thumb`;
  const strippedSrc = message.mediaThumbBase64
    ? `data:image/jpeg;base64,${message.mediaThumbBase64}`
    : null;

  const extra = parseExtra(message.mediaExtra);
  const aspectStyle = extra.w && extra.h ? { aspectRatio: `${extra.w}/${extra.h}` } : undefined;

  return (
    <div ref={containerRef} className="media-preview media-preview--photo" style={aspectStyle}>
      {/* Stripped 占位图 */}
      {strippedSrc && !loaded && (
        <img
          src={strippedSrc}
          alt=""
          className="media-preview__stripped"
          aria-hidden="true"
        />
      )}
      {/* 清晰缩略图（懒加载） */}
      {visible && !error && (
        <img
          ref={imgRef}
          src={thumbSrc}
          alt="图片消息"
          className={`media-preview__thumb ${loaded ? "media-preview__thumb--loaded" : ""}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
      )}
      {/* 加载失败时回退到 stripped */}
      {error && !strippedSrc && (
        <div className="media-preview__fallback">
          <Image className="size-8 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/** 视频：缩略图 + 播放按钮叠层 + 时长标签 */
function VideoPreview({ message }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const thumbSrc = `/api/media/${message.chatId}/${message.telegramMessageId}/thumb`;
  const strippedSrc = message.mediaThumbBase64
    ? `data:image/jpeg;base64,${message.mediaThumbBase64}`
    : null;

  const extra = parseExtra(message.mediaExtra);
  const aspectStyle = extra.w && extra.h ? { aspectRatio: `${extra.w}/${extra.h}` } : undefined;

  return (
    <div className="media-preview media-preview--video" style={aspectStyle}>
      {strippedSrc && !loaded && (
        <img src={strippedSrc} alt="" className="media-preview__stripped" aria-hidden="true" />
      )}
      {!error && (
        <img
          src={thumbSrc}
          alt="视频消息"
          className={`media-preview__thumb ${loaded ? "media-preview__thumb--loaded" : ""}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
      )}
      {error && !strippedSrc && (
        <div className="media-preview__fallback">
          <Video className="size-8 text-muted-foreground" />
        </div>
      )}
      <div className="media-preview__play-overlay">
        <Play className="size-6" fill="currentColor" />
      </div>
      {message.mediaDuration != null && message.mediaDuration > 0 && (
        <span className="media-preview__duration">
          {formatDuration(message.mediaDuration)}
        </span>
      )}
    </div>
  );
}

/** 贴纸 */
function StickerPreview({ message }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const thumbSrc = `/api/media/${message.chatId}/${message.telegramMessageId}/thumb`;
  const extra = parseExtra(message.mediaExtra);

  return (
    <div className="media-preview media-preview--sticker">
      {!error ? (
        <img
          src={thumbSrc}
          alt={extra.emoji ? String(extra.emoji) : "贴纸"}
          className={`media-preview__sticker-img ${loaded ? "media-preview__thumb--loaded" : ""}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
      ) : (
        <div className="media-preview__fallback media-preview__fallback--small">
          <Sticker className="size-6 text-muted-foreground" />
          {extra.emoji ? <span>{String(extra.emoji)}</span> : null}
        </div>
      )}
    </div>
  );
}

/** 文件 / 文档 */
function DocumentPreview({ message }: Props) {
  return (
    <div className="media-preview media-preview--file">
      <div className="media-preview__file-icon">
        <FileText className="size-5" />
      </div>
      <div className="media-preview__file-info">
        <span className="media-preview__file-name">
          {message.mediaFileName || "未命名文件"}
        </span>
        {message.mediaFileSize != null && (
          <span className="media-preview__file-size">
            {formatSize(message.mediaFileSize)}
          </span>
        )}
      </div>
    </div>
  );
}

/** 语音 / 音频 */
function AudioPreview({ message }: Props) {
  const isVoice = message.mediaType === "voice";
  const extra = parseExtra(message.mediaExtra);
  const Icon = isVoice ? Mic : Music;

  return (
    <div className="media-preview media-preview--audio">
      <div className="media-preview__audio-icon">
        <Icon className="size-5" />
      </div>
      <div className="media-preview__audio-info">
        <span className="media-preview__audio-title">
          {isVoice
            ? "语音消息"
            : String(extra.title || extra.performer || "音频")}
        </span>
        {message.mediaDuration != null && (
          <span className="media-preview__audio-duration">
            {formatDuration(message.mediaDuration)}
          </span>
        )}
      </div>
    </div>
  );
}

/** 联系人 */
function ContactPreview({ message }: Props) {
  const extra = parseExtra(message.mediaExtra);
  const name = [extra.firstName, extra.lastName].filter(Boolean).map(String).join(" ") || "联系人";

  return (
    <div className="media-preview media-preview--contact">
      <User className="size-5 text-muted-foreground" />
      <span>{name}</span>
      {extra.phoneNumber ? (
        <span className="text-xs text-muted-foreground">{String(extra.phoneNumber)}</span>
      ) : null}
    </div>
  );
}

/** 位置 */
function GeoPreview({ message: _msg }: Props) {
  return (
    <div className="media-preview media-preview--geo">
      <MapPin className="size-5 text-muted-foreground" />
      <span>位置信息</span>
    </div>
  );
}

/** 投票 */
function PollPreview({ message }: Props) {
  const extra = parseExtra(message.mediaExtra);
  return (
    <div className="media-preview media-preview--poll">
      <BarChart3 className="size-5 text-muted-foreground" />
      <span>{(extra.question as string) || "投票"}</span>
    </div>
  );
}

/** 根据 mediaType 渲染对应的预览组件 */
export function MediaPreview({ message }: Props) {
  if (!message.mediaType) return null;

  const link = message.telegramLink;
  const wrapWithLink = (content: React.ReactNode) =>
    link ? (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="media-preview__link"
        title="在 Telegram 中查看"
      >
        {content}
      </a>
    ) : (
      <>{content}</>
    );

  switch (message.mediaType) {
    case "photo":
      return wrapWithLink(<PhotoPreview message={message} />);
    case "video":
    case "videoNote":
      return wrapWithLink(<VideoPreview message={message} />);
    case "gif":
      return wrapWithLink(<VideoPreview message={message} />);
    case "sticker":
      return wrapWithLink(<StickerPreview message={message} />);
    case "document":
      return wrapWithLink(<DocumentPreview message={message} />);
    case "voice":
    case "audio":
      return wrapWithLink(<AudioPreview message={message} />);
    case "contact":
      return wrapWithLink(<ContactPreview message={message} />);
    case "geo":
      return wrapWithLink(<GeoPreview message={message} />);
    case "poll":
      return wrapWithLink(<PollPreview message={message} />);
    default: {
      // 未知类型显示类型标签
      return wrapWithLink(
        <div className="media-preview media-preview--unknown">
          <FileText className="size-5 text-muted-foreground" />
          <span>[{message.mediaType}]</span>
        </div>,
      );
    }
  }
}
