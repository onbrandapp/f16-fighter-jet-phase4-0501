import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";

export const INTERESTS = ["tactical-briefing", "variant-inquiry", "general-inquiry"] as const;

export const inquiryInput = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("Please enter a valid email address.").max(200),
  interest: z.enum(INTERESTS),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(4000),
  // honeypot — real visitors never fill this
  company: z.string().max(0).optional(),
});

export const inquiries = {
  create: base.input(inquiryInput).handler(async ({ input }) => {
    const { company: _hp, ...values } = input;
    const [row] = await db.insert(schema.inquiries).values(values).returning({ id: schema.inquiries.id });
    if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not store your message." });
    return { id: row.id, received: true as const };
  }),
};
