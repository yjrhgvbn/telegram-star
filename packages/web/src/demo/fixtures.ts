import type { JoinedChat } from "@telegram-star/shared/contracts/chats";
import type { FilterGroup } from "@telegram-star/shared/contracts/filter-groups";
import type { Filter } from "@telegram-star/shared/contracts/filters";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  type ForwardTarget,
} from "@telegram-star/shared/contracts/forward-targets";
import type { Message } from "@telegram-star/shared/contracts/messages";

const chats: JoinedChat[] = [
  { id: "demo-chat-1", title: "星港开发者频道 · 虚构" },
  { id: "demo-chat-2", title: "纸飞机阅读室 · 虚构" },
  { id: "demo-chat-3", title: "像素活动板 · 虚构" },
];

// 人工编写的样例，不包含 Telegram 导出数据、真实账户或可访问的媒体地址。
const samples = [
  [2, "开源", "开源项目「星图笔记」发布了新版本。新增离线搜索和 Markdown 导出，适合周末试用。"],
  [3, "阅读", "今日阅读：把复杂任务拆成可以验证的小步骤。先写下预期结果，再决定用什么工具。"],
  [4, "活动", "活动预告：周六上午举办虚构的「像素工作坊」，一起讨论个人知识库的整理方法。"],
  [2, "开源", "开源工具周报：本期关注本地优先的软件。演示中的项目、频道和作者均为虚构。"],
  [3, "阅读", "阅读笔记：好的文档应让第一次访问项目的人知道它解决什么问题，以及如何开始。"],
  [4, "活动", "活动提醒：本周分享主题是「从收藏到行动」。请准备一条最近收藏、还没处理的信息。"],
  [2, "开源", "开源项目「纸桥」新增快捷键帮助页。一个小改进：在需要的时候，让说明就在手边。"],
  [3, "阅读", "阅读清单：一篇关于 React 列表性能的虚构文章。重点关注稳定的 key、滚动位置和分页边界。"],
  [4, "活动", "活动议程已更新：先演示消息筛选，再交流通知规则，最后留出时间整理待办。"],
  [2, "开源", "开源项目「星图笔记」发布 1.2 示例版本。更新包括全文搜索、标签归档与导入预览。"],
  [3, "阅读", "阅读摘记：信息不必一次全部处理。把已完成的消息标记完成，下次从剩余内容继续。"],
  [4, "活动", "活动提醒：演示用的线上读书会将讨论「如何设计简单的收件箱」。这里没有真实报名链接。"],
  [2, "开源", "开源工具「微光清单」正在完善快速开始文档。目标是让新用户在几分钟内跑通一个例子。"],
  [3, "阅读", "阅读笔记：关键词负责收集，规则负责缩小范围。可以把多个条件组合起来，减少无关消息。"],
  [4, "活动", "活动回顾：整理了今天的三个想法——减少重复通知、给规则起清楚的名字、定期处理收藏。"],
  [2, "开源", "开源动态：虚构项目「星图笔记」加入标签分组。试试在当前消息列表搜索关键词，找到感兴趣的更新。"],
  [3, "阅读", "阅读建议：在搜索框输入「文档」「React」或「开源」，体验从已收藏消息中定位内容。"],
  [4, "活动", "欢迎体验 Telegram Star！这是虚构的活动消息。可以搜索、切换规则并标记完成；刷新页面会恢复样例。"],
] as const;

export function createDemoFixtures(now = new Date()) {
  const createdAt = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const definitions: Pick<Filter, "id" | "name" | "systemKey" | "conditions" | "manualGroupId">[] = [
    { id: 1, name: "全部消息", systemKey: "all_messages", conditions: [], manualGroupId: null },
    { id: 2, name: "开源动态", systemKey: null, conditions: [{ type: "keyword", values: ["开源"] }], manualGroupId: 1 },
    { id: 3, name: "技术阅读", systemKey: null, conditions: [{ type: "keyword", values: ["阅读"] }], manualGroupId: 1 },
    { id: 4, name: "活动提醒", systemKey: null, conditions: [{ type: "keyword", values: ["活动"] }], manualGroupId: 2 },
  ];
  const filters: Filter[] = definitions.map((filter, index) => ({
    enabled: true,
    autoLocateUnreadNearRead: false,
    forwardTargetIds: filter.id === 4 ? [1] : [],
    latestMessageAt: null,
    isFocused: filter.id === 2,
    lastEngagedAt: null,
    lastEngagementType: null,
    lastEngagedMessageId: null,
    manualSortOrder: index,
    createdAt,
    updatedAt: createdAt,
    ...filter,
  }));
  const groups: FilterGroup[] = [
    { id: 1, name: "学习收藏", sortOrder: 0, filterCount: 2, createdAt, updatedAt: createdAt },
    { id: 2, name: "日程与活动", sortOrder: 1, filterCount: 1, createdAt, updatedAt: createdAt },
  ];
  const targets: ForwardTarget[] = [{
    id: 1,
    name: "活动通知 · 演示",
    appriseUrl: "demo://local-only",
    enabled: false,
    filterIds: [4],
    titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
    createdAt,
    updatedAt: createdAt,
  }];
  const messages: Message[] = samples.map(([filterId, keyword, content], index) => {
    const chat = chats[filterId - 2];
    const filter = filters.find((item) => item.id === filterId)!;
    const messageDate = new Date(now.getTime() - (samples.length - index) * 38 * 60_000).toISOString();
    filter.latestMessageAt = messageDate;
    filters[0].latestMessageAt = messageDate;
    return {
      id: index + 1,
      telegramMessageId: index + 1,
      chatId: chat.id,
      chatTitle: chat.title,
      senderName: ["星港编辑 · 虚构", "阅读伙伴 · 虚构", "像素小助手 · 虚构"][filterId - 2],
      senderId: `demo-sender-${filterId}`,
      content,
      contentLinks: [],
      messageDate,
      telegramLink: "",
      isRead: index < 6,
      matchedFilterId: filterId,
      matchedKeyword: keyword,
      filterName: filter.name,
      filterMatches: [
        { filterId, filterName: filter.name, matchedKeyword: keyword },
      ],
      createdAt: messageDate,
      mediaType: null,
      mediaFileName: null,
      mediaFileSize: null,
      mediaMimeType: null,
      mediaDuration: null,
      mediaThumbBase64: null,
      mediaExtra: null,
    };
  });
  return { chats: [...chats], filters, groups, targets, messages };
}
