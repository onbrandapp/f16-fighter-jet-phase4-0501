import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Define your database schema here, then apply it with `bun run db:push`
 * (from packages/web). Table patterns and conventions: skills/app/references/api.md
 */

/** Messages submitted through the Contact section. */
export const inquiries = sqliteTable("inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  interest: text("interest", { enum: ["tactical-briefing", "variant-inquiry", "general-inquiry"] }).notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
