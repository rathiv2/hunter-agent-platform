/**
 * Debug Logs Router
 * Provides endpoints for retrieving, filtering, and exporting debug logs
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { debugLogs, tasks } from "../../drizzle/schema";
import { eq, and, gte, lte, desc, like } from "drizzle-orm";

export const debugLogsRouter = router({
  /**
   * Get logs for a specific task
   */
  getTaskLogs: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
        category: z.string().optional(),
        limit: z.number().min(1).max(1000).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify user owns the task
      const task = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id)))
        .limit(1);

      if (task.length === 0) {
        throw new Error("Task not found or access denied");
      }

      // Build query conditions
      const conditions = [eq(debugLogs.taskId, input.taskId)];
      if (input.level) {
        conditions.push(eq(debugLogs.level, input.level));
      }
      if (input.category) {
        conditions.push(eq(debugLogs.category, input.category));
      }

      const logs = await db
        .select()
        .from(debugLogs)
        .where(and(...conditions))
        .orderBy(desc(debugLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return logs.map((log) => ({
        ...log,
        context: log.context ? JSON.parse(log.context) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }));
    }),

  /**
   * Get logs for all user's tasks
   */
  getUserLogs: protectedProcedure
    .input(
      z.object({
        level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
        category: z.string().optional(),
        days: z.number().min(1).max(90).default(7),
        limit: z.number().min(1).max(1000).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);

      const conditions = [
        eq(debugLogs.userId, ctx.user.id),
        gte(debugLogs.createdAt, startDate),
      ];

      if (input.level) {
        conditions.push(eq(debugLogs.level, input.level));
      }
      if (input.category) {
        conditions.push(eq(debugLogs.category, input.category));
      }

      const logs = await db
        .select()
        .from(debugLogs)
        .where(and(...conditions))
        .orderBy(desc(debugLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return logs.map((log) => ({
        ...log,
        context: log.context ? JSON.parse(log.context) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }));
    }),

  /**
   * Search logs by message content
   */
  searchLogs: protectedProcedure
    .input(
      z.object({
        taskId: z.number().optional(),
        query: z.string().min(1).max(255),
        limit: z.number().min(1).max(1000).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(debugLogs.userId, ctx.user.id)];

      if (input.taskId) {
        // Verify user owns the task
        const task = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.user.id)))
          .limit(1);

        if (task.length === 0) {
          throw new Error("Task not found or access denied");
        }

        conditions.push(eq(debugLogs.taskId, input.taskId));
      }

      conditions.push(like(debugLogs.message, `%${input.query}%`));

      const logs = await db
        .select()
        .from(debugLogs)
        .where(and(...conditions))
        .orderBy(desc(debugLogs.createdAt))
        .limit(input.limit);

      return logs.map((log) => ({
        ...log,
        context: log.context ? JSON.parse(log.context) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }));
    }),

  /**
   * Get log statistics
   */
  getLogStats: protectedProcedure
    .input(
      z.object({
        taskId: z.number().optional(),
        days: z.number().min(1).max(90).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);

      const conditions = [
        eq(debugLogs.userId, ctx.user.id),
        gte(debugLogs.createdAt, startDate),
      ];

      if (input.taskId) {
        conditions.push(eq(debugLogs.taskId, input.taskId));
      }

      const allLogs = await db
        .select()
        .from(debugLogs)
        .where(and(...conditions));

      const stats = {
        total: allLogs.length,
        byLevel: {
          debug: allLogs.filter((l) => l.level === "debug").length,
          info: allLogs.filter((l) => l.level === "info").length,
          warn: allLogs.filter((l) => l.level === "warn").length,
          error: allLogs.filter((l) => l.level === "error").length,
          fatal: allLogs.filter((l) => l.level === "fatal").length,
        },
        byCategory: {} as Record<string, number>,
        averageDuration: 0,
      };

      // Count by category
      for (const log of allLogs) {
        stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
      }

      // Calculate average duration
      const logsWithDuration = allLogs.filter((l) => l.duration);
      if (logsWithDuration.length > 0) {
        const totalDuration = logsWithDuration.reduce((sum, l) => sum + (l.duration || 0), 0);
        stats.averageDuration = Math.round(totalDuration / logsWithDuration.length);
      }

      return stats;
    }),

  /**
   * Export logs as JSON
   */
  exportLogs: protectedProcedure
    .input(
      z.object({
        taskId: z.number().optional(),
        format: z.enum(["json", "csv"]).default("json"),
        days: z.number().min(1).max(90).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.days);

      const conditions = [
        eq(debugLogs.userId, ctx.user.id),
        gte(debugLogs.createdAt, startDate),
      ];

      if (input.taskId) {
        conditions.push(eq(debugLogs.taskId, input.taskId));
      }

      const logs = await db
        .select()
        .from(debugLogs)
        .where(and(...conditions))
        .orderBy(desc(debugLogs.createdAt));

      const parsedLogs = logs.map((log) => ({
        ...log,
        context: log.context ? JSON.parse(log.context) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
      }));

      if (input.format === "json") {
        return {
          format: "json",
          data: JSON.stringify(parsedLogs, null, 2),
          filename: `logs-${new Date().toISOString().split("T")[0]}.json`,
        };
      } else {
        // CSV format
        const headers = ["timestamp", "level", "category", "message", "duration", "taskId"];
        const rows = parsedLogs.map((log) => [
          log.createdAt.toISOString(),
          log.level,
          log.category,
          log.message,
          log.duration || "",
          log.taskId,
        ]);

        const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

        return {
          format: "csv",
          data: csv,
          filename: `logs-${new Date().toISOString().split("T")[0]}.csv`,
        };
      }
    }),

  /**
   * Delete old logs (cleanup)
   */
  deleteLogs: protectedProcedure
    .input(
      z.object({
        taskId: z.number().optional(),
        olderThanDays: z.number().min(1).max(365).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - input.olderThanDays);

      const conditions = [
        eq(debugLogs.userId, ctx.user.id),
        lte(debugLogs.createdAt, cutoffDate),
      ];

      if (input.taskId) {
        conditions.push(eq(debugLogs.taskId, input.taskId));
      }

      // Count before deletion
      const logsToDelete = await db
        .select()
        .from(debugLogs)
        .where(and(...conditions));

      // Delete the logs
      if (logsToDelete.length > 0) {
        await db.delete(debugLogs).where(and(...conditions));
      }

      return {
        deleted: logsToDelete.length,
        message: `Deleted ${logsToDelete.length} logs older than ${input.olderThanDays} days`,
      };
    }),
});
