import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", { id: text("id").primaryKey(), source: text("source").notNull(), sport: text("sport").notNull(), startsAt: text("starts_at"), data: text("data").notNull(), updatedAt: text("updated_at").notNull() }, table => [index("idx_events_sport_start").on(table.sport, table.startsAt)]);
export const sources = sqliteTable("sources", { id: text("id").primaryKey(), status: text("status").notNull(), lastSuccess: text("last_success"), lastAttempt: text("last_attempt"), message: text("message"), nextRefresh: integer("next_refresh").notNull().default(0), leaseUntil: integer("lease_until").notNull().default(0) });
export const snapshots = sqliteTable("snapshots", { key: text("key").primaryKey(), data: text("data").notNull(), updatedAt: text("updated_at").notNull() });
