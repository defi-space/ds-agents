import { context, render } from "@daydreamsai/core";
import { z } from "zod";

export type GoalTerm = "long_term" | "medium_term" | "short_term";

const taskSchema = z.object({
  plan: z.string().optional().describe("The plan to achieve the task"),
  meta: z.any().optional().describe("Metadata associated with the task"),
  actions: z.array(
    z.object({
      type: z.string().describe("The type of action to perform"),
      context: z.string().describe("The context in which to perform the action"),
      payload: z.any().describe("The payload for the action"),
    })
  ).describe("Specific actions required to complete this task"),
});

export const goalSchema = z
  .object({
    id: z.string().describe("Unique identifier for the goal"),
    description: z.string().describe("A description of the goal"),
    success_criteria: z.array(z.string()).describe("The criteria for success"),
    dependencies: z.array(z.string()).describe("The dependencies of the goal"),
    priority: z.number().min(1).max(10).describe("The priority of the goal (1-10)"),
    required_resources: z
      .array(z.string())
      .describe("The resources needed to achieve the goal"),
    estimated_difficulty: z
      .number()
      .min(1)
      .max(10)
      .describe("The estimated difficulty of the goal (1-10)"),
    tasks: z
      .array(taskSchema)
      .describe(
        "The tasks to achieve the goal. This is where you build potential tasks you need todo, based on your understanding of what you can do. These are actions."
      ),
  })
  .describe("A goal to be achieved");

export const goalPlanningSchema = z.object({
  long_term: z
    .array(goalSchema)
    .describe("Strategic goals that are the main goals you want to achieve"),
  medium_term: z
    .array(goalSchema)
    .describe(
      "Tactical goals that will require many short term goals to achieve"
    ),
  short_term: z
    .array(goalSchema)
    .describe(
      "Immediate actionable goals that will require a few tasks to achieve"
    ),
  history: z.array(z.string()).optional().describe("History of goal changes")
});

export type Goal = z.infer<typeof goalPlanningSchema>;
export type SingleGoal = z.infer<typeof goalSchema>;

export interface GoalMemory {
  goal: Goal | null;
  tasks: string[];
  currentTask: string | null;
  history: string[];
  lastUpdated: number;
  status: 'idle' | 'planning' | 'executing';
}

// Updated template to use simpler string format without Handlebars-style conditionals
const template = `
# Goal Manager
Status: {{status}}
Last Updated: {{lastUpdatedTime}}

## Current Goals
{{goalDisplay}}

## Current Tasks
{{tasksDisplay}}

## Active Task
{{currentTaskDisplay}}

## History
{{historyDisplay}}

<goal_planning_rules>
1. Break down the objective into hierarchical goals
2. Each goal must have clear success criteria
3. Identify dependencies between goals
4. Prioritize goals (1-10) based on urgency and impact
5. Short term goals should be given a priority of 10
6. Ensure goals are achievable given the current context
7. Consider past experiences when setting goals
8. Use available game state information to inform strategy

# Each goal must include:
- id: Unique temporary ID used in dependencies
- description: Clear goal statement
- success_criteria: Array of specific conditions for completion
- dependencies: Array of prerequisite goal IDs (empty for initial goals)
- priority: Number 1-10 (10 being highest)
- required_resources: Array of resources needed (based on game state)
- estimated_difficulty: Number 1-10 based on past experiences
</goal_planning_rules>
`;

export const goalContexts = context({
  type: "goal-manager",
  
  schema: z.object({
    id: z.string().describe("Unique identifier for this goal context instance"),
  }),

  key({ id }) {
    return `goal-manager-${id}`;
  },

  create(): GoalMemory {
    return {
      goal: null,
      tasks: [],
      currentTask: null,
      history: [],
      lastUpdated: Date.now(),
      status: 'idle'
    };
  },

  render({ memory }: { memory: GoalMemory }) {
    const lastUpdatedTime = new Date(memory.lastUpdated).toISOString();
    
    // Prepare display values with proper string fallbacks
    const goalDisplay = memory.goal 
      ? JSON.stringify(memory.goal, null, 2) 
      : "No goals defined yet. Use the 'create-goal' action to define goals.";
    
    const tasksDisplay = memory.tasks.length > 0 
      ? memory.tasks.join("\n") 
      : "No tasks defined yet.";
    
    const currentTaskDisplay = memory.currentTask || "No task currently being executed.";
    
    const historyDisplay = memory.history.length > 0 
      ? memory.history.join("\n") 
      : "No history recorded yet.";
    
    // Use the render function with proper string values
    return render(template, {
      status: memory.status,
      lastUpdatedTime,
      goalDisplay,
      tasksDisplay,
      currentTaskDisplay,
      historyDisplay
    });
  },
});
