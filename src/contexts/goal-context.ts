import { context, render, action } from "@daydreamsai/core";
import { z } from "zod";
import { 
  type GoalsStructure, 
} from "../schema/goal-schema";

export interface GoalMemory {
  goals: GoalsStructure | null;
  tasks: string[];
  currentTask: string | null;
  history: string[];
  lastUpdated: number;
  status: 'idle' | 'planning' | 'executing';
}

// Updated template with dedicated competitive intelligence section
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
8. Use available competitive intelligence to inform strategy

# Each goal must include:
- id: Unique temporary ID used in dependencies
- description: Clear goal statement
- success_criteria: Array of specific conditions for completion
- dependencies: Array of prerequisite goal IDs (empty for initial goals)
- priority: Number 1-10 (10 being highest)
- required_resources: Array of resources needed
- estimated_difficulty: Number 1-10 based on past experiences
</goal_planning_rules>
`;

export const goalContext = context({
  // Required: A unique identifier for this type of context
  type: "goal-manager",
  
  // Required: Zod schema defining the arguments needed to identify
  // a specific instance of this context
  schema: z.object({
    id: z.string().describe("Unique identifier for this goal context instance"),
    initialGoal: z.string().optional().describe("Initial goal description to start with"),
    initialTasks: z.array(z.string()).optional().describe("Initial tasks to populate the context with"),
  }),

  // Optional: Function to generate a unique instance key from arguments
  key: ({ id }) => `goal-manager-${id}`,

  // Optional: Description of the context, often used in prompts
  description: "A goal management system that tracks hierarchical goals and tasks",
  
  // Optional: Provides static or dynamic instructions to the LLM within this context
  instructions: (state) => {
    if (state.memory.status === 'planning') {
      return "You are currently planning goals. Focus on creating a hierarchical structure with clear dependencies.";
    } else if (state.memory.status === 'executing') {
      return "You are executing tasks to achieve goals. Focus on completing the current task effectively.";
    } else {
      return "You are a goal-oriented planning system. Organize tasks and goals effectively.";
    }
  },

  // Optional: Function called when a context instance is first created
  setup: async (args, settings, agent) => {
    // Set up initial options based on arguments
    return {
      initialGoalText: args.initialGoal || null,
      initialTaskList: args.initialTasks || [],
    };
  },

  // Optional: Defines the initial structure of the context's persistent memory
  create: (params) => {
    // Get initial values from setup
    const initialGoalText = params.options.initialGoalText;
    const initialTaskList = params.options.initialTaskList || [];
    
    // Create initial goal structure if initialGoalText is provided
    let goalPlan: GoalsStructure | null = null;
    if (initialGoalText) {
      goalPlan = {
        long_term: [{
          id: `goal_${Date.now()}`,
          description: initialGoalText,
          success_criteria: [],
          dependencies: [],
          priority: 10,
          required_resources: [],
          estimated_difficulty: 5,
          tasks: []
        }],
        medium_term: [],
        short_term: []
      };
    }
    
    const initialMemory: GoalMemory = {
      goals: goalPlan,
      tasks: initialTaskList,
      currentTask: initialTaskList.length > 0 ? initialTaskList[0] : null,
      history: initialGoalText ? ["Initial goal and tasks created"] : [],
      lastUpdated: Date.now(),
      status: 'idle',
    };
    
    return initialMemory;
  },

  // Optional: Function to render the context's state for the LLM prompt
  render: ({ memory }) => {
    const lastUpdatedTime = new Date(memory.lastUpdated).toISOString();
    
    // Prepare display values with proper string fallbacks
    const goalDisplay = memory.goals 
      ? JSON.stringify(memory.goals, null, 2) 
      : "No goals defined yet. Use actions like 'addTask' or 'setGoalPlan' to define goals.";
    
    const tasksDisplay = memory.tasks.length > 0 
      ? memory.tasks.map((t: string) => `- ${t}`).join("\n")
      : "No tasks defined yet.";
    
    const currentTaskDisplay = memory.currentTask || "None";
    
    // Only show the last 10 history items to keep context window manageable
    const historyItems = memory.history.slice(-10);
    const historyDisplay = historyItems.length > 0 
      ? historyItems.join("\n") 
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