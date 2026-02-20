import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    password: v.string(),
    name: v.string(),
  }).index("by_email", ["email"]),

  employees: defineTable({
    name: v.string(),
    email: v.string(),
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  assignments: defineTable({
    employeeId: v.id("employees"),
    date: v.string(), // YYYY-MM-DD
    code: v.string(), // AL, SL, UL, PL, BL, BT
    comment: v.optional(v.string()),
    amount: v.optional(v.number()),
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_employee", ["employeeId"])
    .index("by_employee_date", ["employeeId", "date"]),
});