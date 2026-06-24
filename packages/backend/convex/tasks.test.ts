/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("tasks flow", async () => {
  const t = convexTest(schema, modules);

  // List initially empty
  let tasks = await t.query(api.tasks.list);
  expect(tasks).toEqual([]);

  // Create a task
  const taskId = await t.mutation(api.tasks.create, { todo: "Buy milk" });

  // List contains the task
  tasks = await t.query(api.tasks.list);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    todo: "Buy milk",
    completed: false,
  });

  // Toggle the task
  await t.mutation(api.tasks.toggle, { id: taskId });

  // List shows task completed
  tasks = await t.query(api.tasks.list);
  expect(tasks[0].completed).toBe(true);

  // Get completed tasks
  const completedTasks = await t.query(api.tasks.getByCompleted, { completed: true });
  expect(completedTasks).toHaveLength(1);

  // Delete the task
  await t.mutation(api.tasks.remove, { id: taskId });

  // List empty again
  tasks = await t.query(api.tasks.list);
  expect(tasks).toEqual([]);
});
