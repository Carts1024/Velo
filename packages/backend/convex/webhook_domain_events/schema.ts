import { defineTable } from "convex/server";
import { v } from "convex/values";

export default defineTable({
  projectId: v.id("projects"),
  eventKey: v.string(),
  eventType: v.string(),
  schemaVersion: v.string(),
  payloadJson: v.string(),
  createdAt: v.number(),
})
  .index("by_event_key", ["eventKey"])
  .index("by_project_and_created_at", ["projectId", "createdAt"]);
