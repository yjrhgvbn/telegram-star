const TELEGRAM_WEB_HOSTS = new Set(["t.me", "telegram.me"]);

function isTelegramWebHost(hostname: string): boolean {
  return TELEGRAM_WEB_HOSTS.has(hostname.toLowerCase());
}

function hasNumericId(value: string | undefined): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function buildTelegramSchemeUrl(command: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `tg://${command}?${query.toString()}`;
}

export function getTelegramAppUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === "tg:") return parsed.toString();
    if (!["http:", "https:"].includes(parsed.protocol) || !isTelegramWebHost(parsed.hostname)) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    const [first, second, third] = parts;
    if (first === "c" && hasNumericId(second) && hasNumericId(third)) {
      return buildTelegramSchemeUrl("privatepost", {
        channel: second,
        post: third,
      });
    }

    if (first === "s" && second) {
      return hasNumericId(third)
        ? buildTelegramSchemeUrl("resolve", { domain: second, post: third })
        : buildTelegramSchemeUrl("resolve", { domain: second });
    }

    if (first === "joinchat" && second) {
      return buildTelegramSchemeUrl("join", { invite: second });
    }

    if (first.startsWith("+") && first.length > 1) {
      return buildTelegramSchemeUrl("join", { invite: first.slice(1) });
    }

    return hasNumericId(second)
      ? buildTelegramSchemeUrl("resolve", { domain: first, post: second })
      : buildTelegramSchemeUrl("resolve", { domain: first });
  } catch {
    return null;
  }
}

export function getPreferredNativeExternalUrl(url: string): string {
  return getTelegramAppUrl(url) ?? url;
}
