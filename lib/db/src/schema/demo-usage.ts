import { bigserial, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const demoUsage = pgTable("surgeair_demo_usage", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  category: text("category").notNull(),
  ipHash: text("ip_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("surgeair_demo_usage_window").on(table.category, table.ipHash, table.createdAt),
  index("surgeair_demo_usage_recent").on(table.createdAt),
]);
