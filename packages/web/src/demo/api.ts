import {
  filterGroupCreateInputSchema,
  filterGroupOrderInputSchema,
  filterManualOrderInputSchema,
  filterPlacementInputSchema,
} from "@telegram-star/shared/contracts/filter-groups";
import {
  filterCreateInputSchema,
  filterFocusInputSchema,
  filterUpdateInputSchema,
  type Filter,
} from "@telegram-star/shared/contracts/filters";
import { forwardTargetCreateInputSchema } from "@telegram-star/shared/contracts/forward-targets";
import {
  messageEngagementInputSchema,
  messageIdsInputSchema,
  messageListQuerySchema,
  messageRemovalInputSchema,
  type Message,
} from "@telegram-star/shared/contracts/messages";
import { createDemoFixtures } from "./fixtures";

const telegramConfig = {
  telegramConfigured: false,
  telegramConfigSource: "missing" as const,
  databaseConfigured: false,
  apiId: null,
  apiHashMasked: null,
};

function unavailable(action: string): never {
  throw new Error(`Demo 模式不支持${action}。样例仅在当前浏览器内运行，不会连接 Telegram 或发送通知。`);
}

function readBody(options?: RequestInit): unknown {
  if (options?.body === undefined || options.body === null) return {};
  if (typeof options.body !== "string") throw new Error("Demo 仅接受 JSON 请求。");
  try {
    return JSON.parse(options.body);
  } catch {
    throw new Error("Demo 请求的 JSON 格式不正确。");
  }
}

function findById<T extends { id: number }>(items: T[], id: number): T {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error("该演示条目不存在，请刷新页面恢复样例。");
  return item;
}

/** 每个实例有独立的内存数据；不读取账户、浏览器存储，也不使用网络回退。 */
export function createDemoApi() {
  const state = createDemoFixtures();
  let ungroupedPosition = 2;
  let nextFilterId = 5;
  let nextGroupId = 3;
  let nextTargetId = 2;

  function belongsToFilter(message: Message, filterId?: number): boolean {
    // 「全部消息」只是聚合视图，不给消息添加可阻止其删除的虚构归属。
    return filterId === undefined
      || state.filters.some((filter) => filter.id === filterId && filter.systemKey === "all_messages")
      || Boolean(message.filterMatches?.some((match) => match.filterId === filterId));
  }

  function formatMessage(message: Message, filterId?: number): Message {
    const filterMatches = (message.filterMatches ?? []).flatMap((match) => {
      const filter = state.filters.find((item) => item.id === match.filterId);
      return filter ? [{ ...match, filterName: filter.name }] : [];
    });
    const primary = filterMatches.find((match) => match.filterId === (filterId ?? message.matchedFilterId))
      ?? filterMatches[0];
    return {
      ...message,
      filterMatches,
      matchedFilterId: primary?.filterId ?? null,
      filterName: primary?.filterName ?? null,
      matchedKeyword: primary?.matchedKeyword ?? null,
    };
  }

  function listMessages(search: URLSearchParams) {
    const query = messageListQuerySchema.parse(Object.fromEntries(search));
    const needle = query.search?.toLocaleLowerCase();
    const matches = state.messages.filter((message) =>
      belongsToFilter(message, query.filterId)
      && (query.isRead === undefined || message.isRead === query.isRead)
      && (!needle || message.content.toLocaleLowerCase().includes(needle)),
    );
    const limit = query.limit ?? 20;
    let cursorId = query.cursorId;
    let direction = query.direction ?? "before";
    let anchorId: number | null = null;
    if (query.autoLocate && cursorId === undefined) {
      const mostRecentRead = matches.filter((message) => message.isRead).slice(-1)[0];
      anchorId = matches.find((message) => !message.isRead && message.id > (mostRecentRead?.id ?? 0))?.id
        ?? matches[matches.length - 1]?.id ?? null;
      cursorId = anchorId ?? undefined;
      direction = "around";
    }
    if (cursorId !== undefined && !state.messages.some((message) => message.id === cursorId)) {
      throw new Error(`Cursor message not found: ${cursorId}`);
    }
    let start = Math.max(0, matches.length - limit);
    let end = matches.length;
    if (cursorId !== undefined) {
      const cursorIndex = matches.findIndex((message) => message.id >= cursorId!);
      const boundary = cursorIndex < 0 ? matches.length : cursorIndex;
      if (direction === "before") {
        end = boundary;
        start = Math.max(0, end - limit);
      } else if (direction === "after") {
        start = matches[boundary]?.id === cursorId ? boundary + 1 : boundary;
        end = Math.min(matches.length, start + limit);
      } else {
        start = Math.max(0, Math.min(boundary - Math.floor(limit / 2), matches.length - limit));
        end = Math.min(matches.length, start + limit);
      }
    }
    return {
      data: matches.slice(start, end).map((message) => formatMessage(message, query.filterId)),
      hasOlder: start > 0,
      hasNewer: end < matches.length,
      anchorId,
    };
  }

  function editableFilter(id: number) {
    const filter = findById(state.filters, id);
    if (filter.systemKey) unavailable("修改或删除「全部消息」系统规则");
    return filter;
  }

  function setFilterTargets(filter: Filter, ids: number[]) {
    ids.forEach((id) => findById(state.targets, id));
    filter.forwardTargetIds = [...new Set(ids)];
    state.targets.forEach((target) => {
      target.filterIds = target.filterIds.filter((id) => id !== filter.id);
      if (ids.includes(target.id)) target.filterIds.push(filter.id);
    });
  }

  function recordActivity(message: Message, type: "marked_read" | "opened_telegram") {
    const formatted = formatMessage(message);
    const now = new Date().toISOString();
    const activity = {
      lastEngagedAt: now, lastEngagementType: type, lastEngagedMessageId: message.id,
    };
    for (const match of formatted.filterMatches ?? []) {
      Object.assign(findById(state.filters, match.filterId), activity);
    }
    // 仅记下浏览器内的操作意图，不打开外链、不宣称 Telegram 已成功打开。
    return {
      recorded: formatted.matchedFilterId !== null,
      filterId: formatted.matchedFilterId,
      ...activity,
    };
  }

  function handle(url: string, options?: RequestInit): unknown {
    if (!url.startsWith("/") || url.startsWith("//")) unavailable("访问外部地址");
    const { pathname: path, searchParams } = new URL(url, "https://demo.invalid");
    const method = (options?.method ?? "GET").toUpperCase();
    const route = `${method} ${path}`;

    if (route === "GET /auth/status") return {
      ...telegramConfig,
      // 仅用于展示已进入应用的虚构会话；Demo 横幅明确提示没有真实授权。
      authorized: true, connected: true, waitingForCode: false, waitingForPassword: false,
    };
    if (route === "GET /config") return {
      telegram: telegramConfig, media: { thumbIndex: 1, thumbQuality: "medium" },
    };
    if (route === "GET /filters") return state.filters.map((filter) => ({
      ...filter,
      latestMessageAt: state.messages.filter((message) =>
        belongsToFilter(message, filter.id),
      ).slice(-1)[0]?.messageDate ?? null,
    }));
    if (route === "GET /filter-groups") return state.groups.map((group) => ({
      ...group, filterCount: state.filters.filter((filter) => filter.manualGroupId === group.id).length,
    }));
    if (route === "GET /filter-groups/layout") return { ungroupedPosition };
    if (route === "GET /forward-targets") return state.targets;
    if (route === "GET /chats") return state.chats;
    if (route === "GET /clients") return [];
    if (route === "GET /messages") return listMessages(searchParams);
    if (route === "GET /messages/stats") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        total: state.messages.length,
        unread: state.messages.filter((message) => !message.isRead).length,
        today: state.messages.filter((message) => Date.parse(message.messageDate) >= today.getTime()).length,
      };
    }
    if (route === "GET /messages/read-sync-logs") return { data: [] };
    if (method === "GET" && /^\/filters\/\d+\/backfill-jobs\/latest$/.test(path)) return null;

    // 有真实外部副作用的功能必须明确失败，不能显示虚构的发送、预览或同步成功。
    if (path.startsWith("/auth/")) unavailable("登录或退出真实账户");
    if (path === "/config") unavailable("保存 Telegram 凭据或服务器配置");
    if (path === "/forward-targets/test") unavailable("发送测试通知");
    if (path === "/filters/preview") unavailable("预览真实 Telegram 历史消息");
    if (/\/backfill(?:-jobs)?(?:\/|$)/.test(path)) unavailable("补录 Telegram 历史消息");
    if (path === "/messages/force-sync-read") unavailable("同步 Telegram 完成状态");
    if (path.startsWith("/chats/")) unavailable("搜索或读取真实 Telegram 群组");
    if (path.startsWith("/clients/")) unavailable("注册或管理真实设备");

    const readMatch = path.match(/^\/messages\/(\d+)\/read$/);
    if (method === "PATCH" && readMatch) {
      const message = findById(state.messages, Number(readMatch[1]));
      message.isRead = !message.isRead;
      if (message.isRead) recordActivity(message, "marked_read");
      return { id: message.id, isRead: message.isRead };
    }
    const engagementMatch = path.match(/^\/messages\/(\d+)\/engagement$/);
    if (method === "POST" && engagementMatch) {
      const { type } = messageEngagementInputSchema.parse(readBody(options));
      return recordActivity(findById(state.messages, Number(engagementMatch[1])), type);
    }
    if (route === "PATCH /messages/batch-read") {
      const { ids } = messageIdsInputSchema.parse(readBody(options));
      const selected = [...new Set(ids)].map((id) => findById(state.messages, id));
      selected.forEach((message) => {
        if (!message.isRead) recordActivity(message, "marked_read");
        message.isRead = true;
      });
      return { success: true, count: selected.length };
    }
    if (route === "POST /messages/remove") {
      const { ids, filterId } = messageRemovalInputSchema.parse(readBody(options));
      if (findById(state.filters, filterId).systemKey) {
        throw new Error("「全部消息」只是聚合视图，请选择消息对应的具体规则进行移除。");
      }
      const removedIds: number[] = [];
      state.messages = state.messages.filter((message) => {
        if (ids.includes(message.id) && message.filterMatches?.some((match) => match.filterId === filterId)) {
          removedIds.push(message.id);
          message.filterMatches = message.filterMatches.filter((match) => match.filterId !== filterId);
        }
        return Boolean(message.filterMatches?.length);
      });
      return { success: true, removedIds, count: removedIds.length };
    }
    if (route === "POST /filters") {
      const input = filterCreateInputSchema.parse(readBody(options));
      (input.forwardTargetIds ?? []).forEach((id) => findById(state.targets, id));
      const now = new Date().toISOString();
      const filter: Filter = {
        id: nextFilterId++, name: input.name, conditions: input.conditions,
        systemKey: null, enabled: true, autoLocateUnreadNearRead: input.autoLocateUnreadNearRead ?? false,
        forwardTargetIds: [], latestMessageAt: null, isFocused: false, lastEngagedAt: null,
        lastEngagementType: null, lastEngagedMessageId: null, manualGroupId: null,
        manualSortOrder: state.filters.length, createdAt: now, updatedAt: now,
      };
      state.filters.push(filter);
      setFilterTargets(filter, input.forwardTargetIds ?? []);
      return filter;
    }
    if (route === "PUT /filters/manual-order") {
      const input = filterManualOrderInputSchema.parse(readBody(options));
      const ordered = input.filterIds.map((id) => findById(state.filters, id));
      if (ordered.some((filter) => filter.manualGroupId !== input.manualGroupId)) {
        throw new Error("只能在同一个演示分组内排序。");
      }
      ordered.forEach((filter, index) => { filter.manualSortOrder = index; });
      return { success: true };
    }
    const filterMatch = path.match(/^\/filters\/(\d+)(?:\/(toggle|focus|placement))?$/);
    if (filterMatch && ["PUT", "PATCH", "DELETE"].includes(method)) {
      const id = Number(filterMatch[1]);
      const filter = findById(state.filters, id);
      const action = filterMatch[2];
      if (method === "PATCH" && action === "focus") {
        filter.isFocused = filterFocusInputSchema.parse(readBody(options)).isFocused;
      } else if (method === "PATCH" && action === "placement") {
        const input = filterPlacementInputSchema.parse(readBody(options));
        if (input.manualGroupId !== null) findById(state.groups, input.manualGroupId);
        const peers = state.filters.filter((item) => item.id !== id && item.manualGroupId === input.manualGroupId)
          .sort((left, right) => left.manualSortOrder - right.manualSortOrder);
        peers.splice(input.targetIndex ?? peers.length, 0, filter);
        filter.manualGroupId = input.manualGroupId;
        peers.forEach((item, index) => { item.manualSortOrder = index; });
      } else if (method === "PATCH" && action === "toggle") {
        editableFilter(id).enabled = !filter.enabled;
      } else if (method === "PUT" && !action) {
        const input = filterUpdateInputSchema.parse(readBody(options));
        if (input.conditions !== undefined || input.name !== undefined) editableFilter(id);
        if (input.forwardTargetIds !== undefined) setFilterTargets(filter, input.forwardTargetIds);
        Object.assign(filter, input);
      } else if (method === "DELETE" && !action) {
        editableFilter(id);
        setFilterTargets(filter, []);
        state.filters = state.filters.filter((item) => item.id !== id);
        state.messages.forEach((message) => {
          message.filterMatches = message.filterMatches?.filter((match) => match.filterId !== id);
        });
        state.messages = state.messages.filter((message) => message.filterMatches?.length);
        return { success: true };
      } else unavailable("此规则操作");
      filter.updatedAt = new Date().toISOString();
      return filter;
    }
    if (route === "POST /filter-groups") {
      const input = filterGroupCreateInputSchema.parse(readBody(options));
      const now = new Date().toISOString();
      const group = {
        ...input, id: nextGroupId++, sortOrder: state.groups.length,
        filterCount: 0, createdAt: now, updatedAt: now,
      };
      state.groups.push(group);
      return group;
    }
    if (route === "PUT /filter-groups/order") {
      const input = filterGroupOrderInputSchema.parse(readBody(options));
      const ordered = input.ids.map((id) => findById(state.groups, id));
      if (ordered.length !== state.groups.length) throw new Error("请包含所有演示分组。");
      ordered.forEach((group, index) => { group.sortOrder = index; });
      state.groups = ordered;
      ungroupedPosition = Math.min(input.ungroupedPosition ?? ordered.length, ordered.length);
      return { success: true };
    }
    const groupMatch = path.match(/^\/filter-groups\/(\d+)$/);
    if (groupMatch && (method === "PATCH" || method === "DELETE")) {
      const group = findById(state.groups, Number(groupMatch[1]));
      if (method === "PATCH") {
        group.name = filterGroupCreateInputSchema.parse(readBody(options)).name;
        group.updatedAt = new Date().toISOString();
        return { ...group, filterCount: state.filters.filter((filter) => filter.manualGroupId === group.id).length };
      }
      state.groups = state.groups.filter((item) => item.id !== group.id);
      state.filters.forEach((filter) => {
        if (filter.manualGroupId === group.id) filter.manualGroupId = null;
      });
      ungroupedPosition = Math.min(ungroupedPosition, state.groups.length);
      return { success: true };
    }
    const targetMatch = path.match(/^\/forward-targets\/(\d+)$/);
    if (route === "POST /forward-targets" || (targetMatch && method === "PUT")) {
      const input = forwardTargetCreateInputSchema.parse(readBody(options));
      input.filterIds.forEach((id) => findById(state.filters, id));
      const now = new Date().toISOString();
      const target = targetMatch ? findById(state.targets, Number(targetMatch[1])) : {
        id: nextTargetId++, ...input, createdAt: now, updatedAt: now,
      };
      Object.assign(target, input, { updatedAt: now });
      if (!targetMatch) state.targets.push(target);
      state.filters.forEach((filter) => {
        filter.forwardTargetIds = filter.forwardTargetIds.filter((id) => id !== target.id);
        if (input.filterIds.includes(filter.id)) filter.forwardTargetIds.push(target.id);
      });
      return target;
    }
    if (targetMatch && method === "DELETE") {
      const target = findById(state.targets, Number(targetMatch[1]));
      state.targets = state.targets.filter((item) => item.id !== target.id);
      state.filters.forEach((filter) => {
        filter.forwardTargetIds = filter.forwardTargetIds.filter((id) => id !== target.id);
      });
      return { success: true };
    }
    // 白名单以外的请求一律失败；新增真实 API 不会意外穿透到公开 Demo 的后端。
    unavailable(`接口 ${method} ${path}`);
  }

  return async (url: string, options?: RequestInit): Promise<unknown> => {
    if (options?.signal?.aborted) throw new DOMException("请求已取消", "AbortError");
    // 与 JSON API 一致返回独立对象，调用方不能通过修改响应绕过内存操作。
    return JSON.parse(JSON.stringify(handle(url, options)));
  };
}

export const requestDemo = createDemoApi();
