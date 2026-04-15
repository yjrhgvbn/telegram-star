import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const filters = sqliteTable("filters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["keyword", "group", "channel"] }).notNull(),
  value: text("value").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramMessageId: integer("telegram_message_id").notNull(),
  chatId: text("chat_id").notNull(),
  chatTitle: text("chat_title").notNull().default(""),
  senderName: text("sender_name").notNull().default(""),
  senderId: text("sender_id").notNull().default(""),
  content: text("content").notNull().default(""),
  messageDate: text("message_date").notNull(),
  telegramLink: text("telegram_link").notNull().default(""),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  matchedFilterId: integer("matched_filter_id").references(() => filters.id, {
    onDelete: "set null",
  }),
  matchedKeyword: text("matched_keyword"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Filter = typeof filters.$inferSelect;
export type NewFilter = typeof filters.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
