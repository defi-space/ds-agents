import { z } from "@daydreamsai/core";

// Export GoalTerm type here instead of in goal-context.ts
export type GoalTerm = "long_term" | "medium_term" | "short_term";
export interface GoalsStructure {
  long_term: SingleGoal[];
  medium_term: SingleGoal[];
  short_term: SingleGoal[];
}

export interface GoalMemory {
  goals: GoalsStructure | null;
  tasks: string[];
  currentTask: string | null;
  lastUpdated: number;
  status: "idle" | "planning" | "executing";
}

// Task schema - simplified and included directly in goalSchema
const taskSchema = z.object({
  plan: z.string().optional().describe("Plan to achieve this task"),
  actions: z
    .array(
      z.object({
        type: z.string().describe("Type of action to perform"),
        context: z.string().describe("Context in which to perform action"),
        payload: z.any().describe("Payload for the action"),
      })
    )
    .optional()
    .describe("Specific actions required to complete this task"),
});

// Goal schema - simplified
export const goalSchema = z.object({
  id: z.string().describe("Unique identifier for the goal"),
  description: z.string().describe("Description of the goal"),
  success_criteria: z.array(z.string()).describe("Criteria for success"),
  dependencies: z.array(z.string()).describe("Dependencies of the goal"),
  priority: z.number().min(1).max(10).describe("Priority (1-10)"),
  required_resources: z.array(z.string()).describe("Resources needed"),
  estimated_difficulty: z.number().min(1).max(10).describe("Estimated difficulty (1-10)"),
  tasks: z.array(taskSchema).optional().default([]).describe("Tasks to achieve the goal"),
});

// Goal planning schema - simplified
export const goalPlanningSchema = z.object({
  long_term: z.array(goalSchema).describe("Strategic main goals"),
  medium_term: z.array(goalSchema).describe("Tactical goals requiring multiple short-term goals"),
  short_term: z.array(goalSchema).describe("Immediate actionable goals"),
});

// Type exports for easier use
export type SingleGoal = z.infer<typeof goalSchema>;
export type GoalPlan = z.infer<typeof goalPlanningSchema>;
