/**
 * Performance Benchmarking System
 * Provides tools to benchmark agent performance across different tasks and models
 */

import { TaskAnalytics, PerformanceMetrics } from "../agent/analytics";
import { getDb } from "../db";
import { tasks, toolExecutions, tokenUsageLogs } from "../../drizzle/schema";
import { eq, avg, count, sum } from "drizzle-orm";

export interface BenchmarkResult {
  taskId: number;
  title: string;
  duration: number;
  toolSuccessRate: number;
  errorRecoveryRate: number;
  tokenUsage: number;
  cost: number;
  timestamp: Date;
}

export interface PlatformBenchmark {
  totalTasks: number;
  avgDuration: number;
  avgToolSuccessRate: number;
  avgErrorRecoveryRate: number;
  totalTokens: number;
  totalCost: number;
  topTools: Array<{ name: string; count: number; successRate: number }>;
  modelPerformance: Record<string, { avgTokens: number; avgCost: number; count: number }>;
}

export class BenchmarkingService {
  /**
   * Get benchmark for a specific task
   */
  static async getTaskBenchmark(taskId: number): Promise<BenchmarkResult | null> {
    const db = await getDb();
    if (!db) return null;

    const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    const task = taskResult[0];
    if (!task) return null;

    const toolExecs = await db.select().from(toolExecutions).where(eq(toolExecutions.taskId, taskId));
    const tokenLogs = await db.select().from(tokenUsageLogs).where(eq(tokenUsageLogs.taskId, taskId));

    const successfulTools = toolExecs.filter(t => t.status === "success").length;
    const toolSuccessRate = toolExecs.length > 0 ? (successfulTools / toolExecs.length) * 100 : 0;

    const totalTokens = tokenLogs.reduce((sum, log) => sum + log.totalTokens, 0);
    const totalCost = tokenLogs.reduce((sum, log) => sum + parseFloat(log.estimatedCost), 0);

    const duration = task.updatedAt.getTime() - task.createdAt.getTime();

    return {
      taskId,
      title: task.title,
      duration,
      toolSuccessRate,
      errorRecoveryRate: 0, // Placeholder as recovery tracking needs more schema support
      tokenUsage: totalTokens,
      cost: totalCost,
      timestamp: task.createdAt,
    };
  }

  /**
   * Get platform-wide performance benchmarks
   */
  static async getPlatformBenchmark(): Promise<PlatformBenchmark | null> {
    const db = await getDb();
    if (!db) return null;

    const allTasks = await db.select().from(tasks);
    const allToolExecs = await db.select().from(toolExecutions);
    const allTokenLogs = await db.select().from(tokenUsageLogs);

    if (allTasks.length === 0) return null;

    const totalDuration = allTasks.reduce((sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()), 0);
    const successfulTools = allToolExecs.filter(t => t.status === "success").length;
    const totalTokens = allTokenLogs.reduce((sum, log) => sum + log.totalTokens, 0);
    const totalCost = allTokenLogs.reduce((sum, log) => sum + parseFloat(log.estimatedCost), 0);

    // Group tools by name
    const toolStats: Record<string, { count: number; success: number }> = {};
    for (const exec of allToolExecs) {
      if (!toolStats[exec.toolName]) {
        toolStats[exec.toolName] = { count: 0, success: 0 };
      }
      toolStats[exec.toolName].count++;
      if (exec.status === "success") {
        toolStats[exec.toolName].success++;
      }
    }

    const topTools = Object.entries(toolStats)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        successRate: (stats.success / stats.count) * 100,
      }))
      .sort((a, b) => b.count - a.count);

    // Group model performance
    const modelStats: Record<string, { tokens: number; cost: number; count: number }> = {};
    for (const log of allTokenLogs) {
      if (!modelStats[log.model]) {
        modelStats[log.model] = { tokens: 0, cost: 0, count: 0 };
      }
      modelStats[log.model].tokens += log.totalTokens;
      modelStats[log.model].cost += parseFloat(log.estimatedCost);
      modelStats[log.model].count++;
    }

    const modelPerformance = Object.fromEntries(
      Object.entries(modelStats).map(([model, stats]) => [
        model,
        {
          avgTokens: stats.tokens / stats.count,
          avgCost: stats.cost / stats.count,
          count: stats.count,
        },
      ])
    );

    return {
      totalTasks: allTasks.length,
      avgDuration: totalDuration / allTasks.length,
      avgToolSuccessRate: allToolExecs.length > 0 ? (successfulTools / allToolExecs.length) * 100 : 0,
      avgErrorRecoveryRate: 0,
      totalTokens,
      totalCost,
      topTools,
      modelPerformance,
    };
  }

  /**
   * Compare performance between two tasks
   */
  static async compareTasks(taskId1: number, taskId2: number) {
    const b1 = await this.getTaskBenchmark(taskId1);
    const b2 = await this.getTaskBenchmark(taskId2);

    if (!b1 || !b2) return null;

    return {
      task1: b1,
      task2: b2,
      comparison: {
        durationDiff: b2.duration - b1.duration,
        costDiff: b2.cost - b1.cost,
        tokenDiff: b2.tokenUsage - b1.tokenUsage,
        successRateDiff: b2.toolSuccessRate - b1.toolSuccessRate,
      },
    };
  }
}
