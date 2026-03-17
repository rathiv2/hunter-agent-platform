/**
 * Structured Logging Service
 * Provides context-aware logging with database persistence
 */

import { getDb } from "../db";
import { debugLogs, InsertDebugLog } from "../../drizzle/schema";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogCategory = "agent_loop" | "tool_execution" | "memory" | "error_recovery" | "scheduling" | "api" | "database" | "websocket" | "auth" | "other";

export interface LogContext {
  taskId?: number;
  userId?: number;
  toolName?: string;
  phase?: string;
  stepIndex?: number;
  [key: string]: any;
}

export class StructuredLogger {
  private taskId?: number;
  private userId?: number;
  private context: LogContext = {};

  constructor(taskId?: number, userId?: number) {
    this.taskId = taskId;
    this.userId = userId;
  }

  /**
   * Set additional context for logging
   */
  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Log a debug message
   */
  async debug(category: LogCategory, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log("debug", category, message, metadata);
  }

  /**
   * Log an info message
   */
  async info(category: LogCategory, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log("info", category, message, metadata);
  }

  /**
   * Log a warning message
   */
  async warn(category: LogCategory, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log("warn", category, message, metadata);
  }

  /**
   * Log an error message
   */
  async error(category: LogCategory, message: string, error?: Error, metadata?: Record<string, any>): Promise<void> {
    const errorMetadata = {
      ...metadata,
      errorName: error?.name,
      errorMessage: error?.message,
    };
    await this.log("error", category, message, errorMetadata, error?.stack);
  }

  /**
   * Log a fatal error
   */
  async fatal(category: LogCategory, message: string, error?: Error, metadata?: Record<string, any>): Promise<void> {
    const errorMetadata = {
      ...metadata,
      errorName: error?.name,
      errorMessage: error?.message,
    };
    await this.log("fatal", category, message, errorMetadata, error?.stack);
  }

  /**
   * Log with performance metrics
   */
  async logWithDuration(
    category: LogCategory,
    message: string,
    duration: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log("info", category, message, { ...metadata, duration }, undefined, duration);
  }

  /**
   * Internal log method
   */
  private async log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    metadata?: Record<string, any>,
    stackTrace?: string,
    duration?: number
  ): Promise<void> {
    // Console output
    const timestamp = new Date().toISOString();
    const logPrefix = `[${timestamp}] [${level.toUpperCase()}] [${category}]`;
    
    console.log(`${logPrefix} ${message}`, metadata ? metadata : "");

    // Database persistence
    if (this.taskId && this.userId) {
      try {
        const db = await getDb();
        if (db) {
          const logEntry: InsertDebugLog = {
            taskId: this.taskId,
            userId: this.userId,
            level,
            category,
            message,
            context: JSON.stringify(this.context),
            stackTrace,
            metadata: metadata ? JSON.stringify(metadata) : null,
            duration,
            createdAt: new Date(),
          };

          await db.insert(debugLogs).values(logEntry);
        }
      } catch (err) {
        console.error(`[Logger] Failed to persist log: ${err}`);
      }
    }
  }

  /**
   * Create a child logger with additional context
   */
  createChild(additionalContext: Partial<LogContext>): StructuredLogger {
    const child = new StructuredLogger(this.taskId, this.userId);
    child.setContext({ ...this.context, ...additionalContext });
    return child;
  }
}

/**
 * Global logger instance factory
 */
export function createLogger(taskId?: number, userId?: number): StructuredLogger {
  return new StructuredLogger(taskId, userId);
}

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private logger: StructuredLogger;
  private category: LogCategory;
  private message: string;

  constructor(logger: StructuredLogger, category: LogCategory, message: string) {
    this.logger = logger;
    this.category = category;
    this.message = message;
    this.startTime = Date.now();
  }

  /**
   * End the timer and log the duration
   */
  async end(metadata?: Record<string, any>): Promise<number> {
    const duration = Date.now() - this.startTime;
    await this.logger.logWithDuration(this.category, this.message, duration, metadata);
    return duration;
  }

  /**
   * Get elapsed time without logging
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }
}
