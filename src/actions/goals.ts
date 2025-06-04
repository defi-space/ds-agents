import { action, z } from "@daydreamsai/core";
import {
  goalPlanningSchema,
  goalSchema,
  type SingleGoal,
  type GoalTerm,
  type GoalsStructure,
  type GoalMemory,
} from "../schema/goal-schema";

// Maximum number of goals per category
const MAX_GOALS_PER_CATEGORY = 50;

export const goalActions = [
  action({
    name: "addTask",
    description: "Creates and adds a new task to your goal list",
    instructions:
      "Use this action when you need to add a new task to your goals with specific priority and timeframe",
    schema: z.object({
      task: z.string().describe("Description of the task to add to the goal list"),
      priority: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe("Priority level from 1 (lowest) to 10 (highest)"),
      term: z
        .enum(["long_term", "medium_term", "short_term"])
        .default("long_term")
        .describe("Timeframe category for the task"),
    }),
    handler(args, ctx, _agent) {
      if (!ctx.memory) {
        return {
          success: false,
          message: "Cannot add task: agent memory is not initialized",
          timestamp: Date.now(),
        };
      }

      const agentMemory = ctx.memory as GoalMemory;

      // Initialize goal structure if it doesn't exist
      if (!agentMemory.goals) {
        agentMemory.goals = {
          long_term: [],
          medium_term: [],
          short_term: [],
        };
      }

      const newTask: SingleGoal = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        description: args.task,
        success_criteria: [],
        dependencies: [],
        priority: args.priority ?? 5, // Use default from schema
        required_resources: [],
        estimated_difficulty: 1,
        tasks: [],
      };

      const term = args.term as GoalTerm;

      // Add the new task and ensure we don't exceed the maximum number per category
      agentMemory.goals[term].push(newTask);
      if (agentMemory.goals[term].length > MAX_GOALS_PER_CATEGORY) {
        // Sort by priority (highest first) and keep only the top MAX_GOALS_PER_CATEGORY
        agentMemory.goals[term].sort((a, b) => b.priority - a.priority);
        agentMemory.goals[term] = agentMemory.goals[term].slice(0, MAX_GOALS_PER_CATEGORY);
      }

      agentMemory.lastUpdated = Date.now();

      return {
        success: true,
        message: `Successfully added new ${term} task: ${args.task}`,
        data: {
          task: newTask,
          term: term,
          goalState: {
            taskCount: agentMemory.goals[term].length,
            status: agentMemory.status,
          },
        },
        timestamp: Date.now(),
      };
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Task addition failed:", error);
      ctx.emit("taskAdditionError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "setGoalPlan",
    description: "Sets the complete goal planning structure for you",
    instructions:
      "Use this action when you need to establish or completely replace your entire goal structure",
    schema: z.object({
      goal: goalPlanningSchema.describe(
        "Complete goal structure with long_term, medium_term, and short_term goals"
      ),
    }),
    handler(args, ctx, _agent) {
      if (!ctx.memory) {
        return {
          success: false,
          message: "Cannot set goal plan: agent memory is not initialized",
          timestamp: Date.now(),
        };
      }

      const agentMemory = ctx.memory as GoalMemory;

      // Set the new goal structure - need to convert from goalPlanningSchema to GoalStructure format
      const newGoals: GoalsStructure = {
        long_term: [],
        medium_term: [],
        short_term: [],
      };

      // Process each category and limit to MAX_GOALS_PER_CATEGORY
      for (const term of ["long_term", "medium_term", "short_term"] as GoalTerm[]) {
        // Get the goals for this term, sort by priority and take only the top MAX_GOALS_PER_CATEGORY
        const goals = args.goal[term] || [];
        newGoals[term] = goals
          .sort((a, b) => b.priority - a.priority)
          .slice(0, MAX_GOALS_PER_CATEGORY);
      }

      // Update the goals
      agentMemory.goals = newGoals;
      agentMemory.lastUpdated = Date.now();

      return {
        success: true,
        message: "Successfully updated the complete goal plan",
        data: {
          newGoals,
        },
        timestamp: Date.now(),
      };
    },
    format: (result) => {
      if (!result.data || result.data.success === false) {
        return `Failed to set goal plan: ${result.data?.message || "Unknown error"}`;
      }

      const goalData = result.data.data?.newGoals;
      if (!goalData) return "Goal plan updated.";

      const longTermCount = goalData.long_term?.length || 0;
      const mediumTermCount = goalData.medium_term?.length || 0;
      const shortTermCount = goalData.short_term?.length || 0;

      return `Goal plan updated with ${longTermCount} long-term, ${mediumTermCount} medium-term, and ${shortTermCount} short-term goals.`;
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Goal plan update failed:", error);
      ctx.emit("goalPlanError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "updateGoal",
    description: "Updates properties of a specific goal by ID",
    instructions:
      "Use this action when you need to modify an existing goal's attributes like description or priority",
    schema: z.object({
      goal: goalSchema.describe("Goal object with the updated fields (must include the goal's id)"),
      term: z
        .enum(["long_term", "medium_term", "short_term"])
        .optional()
        .describe("Timeframe category where the goal is located (if known)"),
    }),
    handler(args, ctx, _agent) {
      if (!ctx.memory) {
        return {
          success: false,
          message: "Cannot update goal: agent memory is not initialized",
          timestamp: Date.now(),
        };
      }

      const agentMemory = ctx.memory as GoalMemory;

      if (!agentMemory.goals) {
        return {
          success: false,
          message: "Cannot update goal: no goals have been initialized yet",
          timestamp: Date.now(),
        };
      }

      const terms: GoalTerm[] = args.term
        ? [args.term as GoalTerm]
        : ["long_term", "medium_term", "short_term"];
      let updated = false;
      let updatedGoal = null;
      let updatedTerm = null;

      for (const term of terms) {
        const goalIndex = agentMemory.goals[term].findIndex(
          (g: SingleGoal) => g.id === args.goal.id
        );

        if (goalIndex !== -1) {
          const oldGoal = agentMemory.goals[term][goalIndex];
          updatedGoal = {
            ...oldGoal,
            ...args.goal,
          };

          agentMemory.goals[term][goalIndex] = updatedGoal;
          agentMemory.lastUpdated = Date.now();

          updated = true;
          updatedTerm = term;
          break;
        }
      }

      if (!updated) {
        return {
          success: false,
          message: `Cannot update goal: no goal with ID ${args.goal.id} was found`,
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        message: `Successfully updated ${updatedTerm} goal: ${updatedGoal?.description}`,
        data: {
          goal: updatedGoal,
          term: updatedTerm,
        },
        timestamp: Date.now(),
      };
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Goal update failed:", error);
      ctx.emit("goalUpdateError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "deleteGoal",
    description: "Removes a goal from your goal list",
    instructions:
      "Use this action when you need to remove a goal that is no longer relevant or has been completed",
    schema: z.object({
      goalId: z.string().describe("Unique ID of the goal to delete"),
      term: z
        .enum(["long_term", "medium_term", "short_term"])
        .optional()
        .describe("Timeframe category where the goal is located (if known)"),
    }),
    handler(args, ctx, _agent) {
      if (!ctx.memory) {
        return {
          success: false,
          message: "Cannot delete goal: agent memory is not initialized",
          timestamp: Date.now(),
        };
      }

      const agentMemory = ctx.memory as GoalMemory;

      if (!agentMemory.goals) {
        return {
          success: false,
          message: "Cannot delete goal: no goals have been initialized yet",
          timestamp: Date.now(),
        };
      }

      const terms: GoalTerm[] = args.term
        ? [args.term as GoalTerm]
        : ["long_term", "medium_term", "short_term"];
      let deleted = false;
      let deletedGoal = null;
      let deletedTerm = null;

      for (const term of terms) {
        const goalIndex = agentMemory.goals[term].findIndex(
          (g: SingleGoal) => g.id === args.goalId
        );

        if (goalIndex !== -1) {
          deletedGoal = agentMemory.goals[term][goalIndex];
          agentMemory.goals[term].splice(goalIndex, 1);
          agentMemory.lastUpdated = Date.now();

          deleted = true;
          deletedTerm = term;
          break;
        }
      }

      if (!deleted) {
        return {
          success: false,
          message: `Cannot delete goal: no goal with ID ${args.goalId} was found`,
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        message: `Successfully deleted ${deletedTerm} goal: ${deletedGoal?.description || "unknown goal"}`,
        data: {
          deletedGoal,
          term: deletedTerm,
        },
        timestamp: Date.now(),
      };
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Goal deletion failed:", error);
      ctx.emit("goalDeletionError", { action: ctx.call.name, error: error.message });
    },
  }),
];
