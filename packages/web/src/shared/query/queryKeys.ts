export const queryKeys = {
  auth: {
    status: ["auth", "status"] as const,
  },
  config: {
    status: ["config", "status"] as const,
  },
  filters: {
    all: ["filters"] as const,
    preview: ["filters", "preview"] as const,
    latestBackfill: (filterId: number) =>
      ["filters", filterId, "backfill", "latest"] as const,
  },
  filterGroups: {
    all: ["filter-groups"] as const,
    layout: ["filter-groups", "layout"] as const,
  },
  chats: {
    joined: ["chats", "joined"] as const,
  },
  clients: {
    all: ["clients"] as const,
  },
  forwardTargets: {
    all: ["forward-targets"] as const,
  },
  messages: {
    stats: ["messages", "stats"] as const,
  },
} as const;
