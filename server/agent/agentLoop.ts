/**
 * Core Agent Loop
 * Implements the perception -> planning -> execution -> learning cycle
 */

import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { toolRegistry } from "./toolRegistry";
import {
  AgentPhase,
  AgentThought,
  Checkpoint,
  ConversationMessage,
  ExecutionContext,
  ExecutionEvent,
  TaskPlan,
  ToolCall,
} from "./types";
import { TaskMemoryContext } from "./memory";
import { createLogger, StructuredLogger } from "../services/logger";
import { eq } from "drizzle-orm";
import { tasks, checkpoints, conversationHistory, toolExecutions } from "../../drizzle/schema";

export class AgentLoop {
  private context: ExecutionContext | null = null;
  private memory: TaskMemoryContext | null = null;
  private logger: StructuredLogger | null = null;
  private onThought?: (thought: AgentThought) => void;
  private onPhaseChange?: (phase: AgentPhase) => void;
  private onToolExecution?: (toolName: string, status: string) => void;

  /**
   * Initialize the agent with a task and optional callbacks
   */
  async initialize(
    taskId: number,
    userId: number,
    userPrompt: string,
    callbacks?: {
      onThought?: (thought: AgentThought) => void;
      onPhaseChange?: (phase: AgentPhase) => void;
      onToolExecution?: (toolName: string, status: string) => void;
    }
  ): Promise<void> {
    this.onThought = callbacks?.onThought;
    this.onPhaseChange = callbacks?.onPhaseChange;
    this.onToolExecution = callbacks?.onToolExecution;

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Load or create task
    const taskResult = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    const task = taskResult[0];
    if (!task) throw new Error("Task not found");

    // Load conversation history
    const historyResult = await db
      .select()
      .from(conversationHistory)
      .where(eq(conversationHistory.taskId, taskId));

    const messages: ConversationMessage[] = historyResult.map((h) => ({
      role: h.role as "user" | "assistant" | "system" | "tool",
      content: h.content,
      timestamp: h.createdAt,
    }));

    // Check for existing checkpoint to resume
    let lastCheckpoint: Checkpoint | undefined;
    const checkpointResult = await db
      .select()
      .from(checkpoints)
      .where(eq(checkpoints.taskId, taskId))
      .orderBy((c) => c.createdAt)
      .limit(1);

    if (checkpointResult.length > 0) {
      const cp = checkpointResult[0];
      lastCheckpoint = {
        taskId: cp.taskId,
        phase: cp.phase as AgentPhase,
        stepIndex: cp.stepIndex,
        state: JSON.parse(cp.state),
        conversationHistory: messages,
        timestamp: cp.createdAt,
      };
    }

    // Initialize logger
    this.logger = createLogger(taskId, userId);
    await this.logger.info("agent_loop", "Initializing agent loop", { taskId, userId });

    // Initialize context
    this.context = {
      taskId,
      userId,
      currentPhase: lastCheckpoint?.phase || "perception",
      plan: {
        id: `plan-${taskId}`,
        title: task.title,
        description: task.description || "",
        phases: task.plan ? JSON.parse(task.plan) : [],
        estimatedTokens: 0,
        createdAt: new Date(),
      },
      executionLog: task.executionLog ? JSON.parse(task.executionLog) : [],
      currentStepIndex: lastCheckpoint?.stepIndex || 0,
      conversationHistory: messages,
      state: lastCheckpoint?.state || {},
      startTime: task.startedAt || new Date(),
      lastCheckpoint,
    };

    // Initialize memory
    this.memory = new TaskMemoryContext(taskId);

    // Add user message to conversation and memory
    this.context.conversationHistory.push({
      role: "user",
      content: userPrompt,
      timestamp: new Date(),
    });
    this.memory.recordThought(`User prompt: ${userPrompt}`);
  }

  /**
   * Execute one iteration of the agent loop
   */
  async executePhase(): Promise<boolean> {
    if (!this.context) throw new Error("Agent not initialized");

    const phase = this.context.currentPhase;
    this.onPhaseChange?.(phase);

    try {
      switch (phase) {
        case "perception":
          await this.perceptionPhase();
          this.context.currentPhase = "planning";
          break;

        case "planning":
          await this.planningPhase();
          this.context.currentPhase = "execution";
          break;

        case "execution":
          const continueExecution = await this.executionPhase();
          if (!continueExecution) {
            this.context.currentPhase = "learning";
          }
          break;

        case "learning":
          await this.learningPhase();
          this.context.currentPhase = "completed";
          break;

        case "completed":
        case "failed":
          return false; // Task is done

        default:
          throw new Error(`Unknown phase: ${phase}`);
      }

      // Save checkpoint after each phase
      await this.saveCheckpoint();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addExecutionEvent({
        phase,
        type: "error",
        message: errorMessage,
      });
      this.context.currentPhase = "failed";
      await this.saveCheckpoint();
      return false;
    }
  }

  /**
   * Perception Phase: Analyze the task and environment
   */
  private async perceptionPhase(): Promise<void> {
    if (!this.context) return;

    this.addExecutionEvent({
      phase: "perception",
      type: "thought",
      message: "Analyzing task requirements and available tools",
    });

    const thought: AgentThought = {
      content: "Perception phase: Understanding the task",
      reasoning: `Task: ${this.context.plan.title}\nAvailable tools: ${toolRegistry
        .listTools()
        .map((t) => t.name)
        .join(", ")}`,
      timestamp: new Date(),
    };

    this.onThought?.(thought);
    this.memory?.recordThought(thought.content);
  }

  /**
   * Planning Phase: Create execution plan using Hunter Alpha
   */
  private async planningPhase(): Promise<void> {
    if (!this.context) return;

    this.addExecutionEvent({
      phase: "planning",
      type: "thought",
      message: "Generating execution plan with Hunter Alpha",
    });

    const systemPrompt = `You are an expert task planner. Analyze the user's request and create a detailed execution plan.
Available tools: ${toolRegistry
      .listTools()
      .map((t) => `${t.name}: ${t.description}`)
      .join("\n")}

Return a JSON object with this structure:
{
  "phases": [
    {
      "name": "phase name",
      "description": "what this phase does",
      "steps": [
        {
          "description": "step description",
          "tool": "tool_name",
          "params": { "param": "value" },
          "expectedOutput": "what we expect to get"
        }
      ]
    }
  ]
}`;

    const memoryContext = this.memory?.getContextForLLM() || "";
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "system", content: memoryContext },
      ...this.context.conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const response = await invokeLLM({
      messages: messages as any,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "execution_plan",
          strict: false,
          schema: {
            type: "object",
            properties: {
              phases: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    steps: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          description: { type: "string" },
                          tool: { type: "string" },
                          params: { type: "object" },
                          expectedOutput: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const planContent = response.choices[0].message.content;
    const planData = typeof planContent === "string" ? JSON.parse(planContent) : planContent;

    // Update context with plan
    if (planData.phases) {
      this.context.plan.phases = planData.phases;
    }

    const thought: AgentThought = {
      content: "Planning phase complete",
      reasoning: `Created plan with ${this.context.plan.phases.length} phases`,
      timestamp: new Date(),
    };

    this.onThought?.(thought);
    this.memory?.recordThought(thought.content);
    this.context.conversationHistory.push({
      role: "assistant",
      content: `I've created an execution plan with ${this.context.plan.phases.length} phases.`,
      timestamp: new Date(),
    });
  }

  /**
   * Execution Phase: Execute planned steps
   */
  private async executionPhase(): Promise<boolean> {
    if (!this.context || !this.logger) return false;

    const currentPhase = this.context.plan.phases[0];
    if (!currentPhase) {
      return false; // No more phases
    }

    // Check if this phase should run in parallel
    if (currentPhase.parallel) {
      await this.logger.info("agent_loop", `Executing phase ${currentPhase.name} in parallel`, {
        phaseId: currentPhase.id,
        stepCount: currentPhase.steps.length,
      });
      return await this.executeParallelPhase(currentPhase);
    }

    const currentStep = currentPhase.steps[this.context.currentStepIndex];
    if (!currentStep) {
      // Move to next phase
      this.context.plan.phases.shift();
      this.context.currentStepIndex = 0;
      return true; // Continue execution
    }

    await this.executeStep(currentStep);
    this.context.currentStepIndex++;

    return true; // Continue execution
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: any): Promise<void> {
    if (!this.context || !this.logger) return;

    await this.logger.info("tool_execution", `Executing step: ${step.description}`, {
      tool: step.tool,
      params: step.params,
    });

    this.addExecutionEvent({
      phase: "execution",
      type: "thought",
      message: `Executing step: ${step.description}`,
    });

    const toolCall: ToolCall = {
      toolName: step.tool,
      params: step.params,
      timeout: step.timeout,
    };

    this.onToolExecution?.(step.tool, "running");

    const result = await toolRegistry.executeTool(toolCall);

    if (result.success) {
      await this.logger.info("tool_execution", `Tool ${step.tool} succeeded`, {
        tool: step.tool,
        duration: result.duration,
      });
    } else {
      await this.logger.error("tool_execution", `Tool ${step.tool} failed`, new Error(result.error), {
        tool: step.tool,
        duration: result.duration,
      });
    }

    this.addExecutionEvent({
      phase: "execution",
      type: "tool_result",
      message: `Tool ${step.tool} ${result.success ? "succeeded" : "failed"}`,
      data: {
        tool: step.tool,
        success: result.success,
        output: result.output,
        error: result.error,
      },
    });

    this.onToolExecution?.(step.tool, result.success ? "success" : "failed");

    if (result.success) {
      this.memory?.recordExecution(step.tool, step.params, result.output);
    } else {
      this.memory?.recordError(step.tool, new Error(result.error || "Unknown error"));
    }

    // Store tool execution
    const db = await getDb();
    if (db) {
      await db.insert(toolExecutions).values({
        taskId: this.context.taskId,
        toolName: step.tool,
        params: JSON.stringify(step.params),
        result: result.success ? JSON.stringify(result.output) : null,
        error: result.error || null,
        duration: result.duration,
        status: result.success ? "success" : "failed",
        completedAt: new Date(),
      });
    }

    if (!result.success) {
      throw new Error(`Tool execution failed: ${result.error}`);
    }

    // Store result in state
    this.context.state[`${step.tool}_result`] = result.output;
  }

  /**
   * Execute all steps in a phase in parallel
   */
  private async executeParallelPhase(phase: any): Promise<boolean> {
    if (!this.context) return false;

    this.addExecutionEvent({
      phase: "execution",
      type: "thought",
      message: `Executing phase ${phase.name} in parallel`,
    });

    // Execute all steps concurrently
    const promises = phase.steps.map((step: any) => this.executeStep(step));
    
    try {
      await Promise.all(promises);
      
      // Move to next phase
      this.context.plan.phases.shift();
      this.context.currentStepIndex = 0;
      return true;
    } catch (error) {
      throw new Error(`Parallel execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Learning Phase: Evaluate results and generate summary
   */
  private async learningPhase(): Promise<void> {
    if (!this.context) return;

    this.addExecutionEvent({
      phase: "learning",
      type: "thought",
      message: "Evaluating execution results",
    });

    const systemPrompt = `You are an expert task evaluator. Summarize the execution results and provide insights.`;

    const memoryContext = this.memory?.getContextForLLM() || "";
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "system", content: memoryContext },
      ...this.context.conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: "system",
        content: `Execution log: ${JSON.stringify(this.context.executionLog)}`,
      },
    ];

    const response = await invokeLLM({
      messages: messages as any,
    });

    const summary = response.choices[0].message.content;

    this.context.conversationHistory.push({
      role: "assistant",
      content: typeof summary === "string" ? summary : JSON.stringify(summary),
      timestamp: new Date(),
    });

    this.addExecutionEvent({
      phase: "learning",
      type: "thought",
      message: "Task execution complete",
    });
  }

  /**
   * Add an execution event to the log
   */
  private addExecutionEvent(
    event: Omit<ExecutionEvent, "timestamp" | "phase"> & { phase?: AgentPhase }
  ): void {
    if (!this.context) return;

    this.context.executionLog.push({
      timestamp: new Date(),
      phase: event.phase || this.context.currentPhase,
      type: event.type,
      message: event.message,
      data: event.data,
    });
  }

  /**
   * Save checkpoint for recovery
   */
  private async saveCheckpoint(): Promise<void> {
    if (!this.context) return;

    const db = await getDb();
    if (!db) return;

    await db.insert(checkpoints).values({
      taskId: this.context.taskId,
      phase: this.context.currentPhase,
      state: JSON.stringify(this.context.state),
      stepIndex: this.context.currentStepIndex,
    });

    // Update task status
    await db
      .update(tasks)
      .set({
        status: this.context.currentPhase as any,
        executionLog: JSON.stringify(this.context.executionLog),
        currentPhase: this.context.currentPhase,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, this.context.taskId));
  }

  /**
   * Get current context
   */
  getContext(): ExecutionContext | null {
    return this.context;
  }
}
