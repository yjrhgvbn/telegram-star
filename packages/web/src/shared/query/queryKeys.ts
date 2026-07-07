export const queryKeys = {
  auth: {
    status: ["auth", "status"] as const,
  },
  config: {
    status: ["config", "status"] as const,
  },
  filters: {
    all: ["filters"] as const,
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
