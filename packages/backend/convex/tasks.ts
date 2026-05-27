import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});

export const getByCompleted = query({
  args: { completed: v.boolean() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_completed", (q) => q.eq("completed", args.completed))
      .collect();
  },
});

export const create = mutation({
  args: { todo: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      todo: args.todo,
      completed: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const toggle = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    await ctx.db.patch(args.id, {
      completed: !task.completed,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
