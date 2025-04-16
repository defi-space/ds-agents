import { context, render, action } from "@daydreamsai/core";
import { z } from "zod";
import { goalPlanningSchema, goalSchema } from "../schema/goal-schema";

// Import outputs
import { goalManagerOutput } from "../outputs/goal-manager";

export type GoalTerm = "long_term" | "medium_term" | "short_term";

export type Goal = z.infer<typeof goalPlanningSchema>;
export type SingleGoal = z.infer<typeof goalSchema>;

export interface GoalMemory {
  goal: Goal | null;
  tasks: string[];
  currentTask: string | null;
  history: string[];
  lastUpdated: number;
  status: 'idle' | 'planning' | 'executing';
  competitiveIntelligence: any | null;
  lastCompetitiveAnalysis: string | null;
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

{{competitiveIntelligence}}

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

// Create a status update action
const updateStatusAction = action({
  name: "updateGoalStatus",
  description: "Updates the current status of the goal manager",
  instructions: "Use this to change the agent's current mode of operation (planning, executing, or idle)",
  schema: z.object({
    status: z.enum(["idle", "planning", "executing"]).describe("The new status to set"),
    currentTask: z.string().optional().describe("The task to set as currently active (optional)"),
  }),
  handler(args, ctx, agent) {
    if (!ctx.memory) {
      return {
        success: false,
        error: "Agent memory not initialized",
        message: "Cannot update status: agent memory is not initialized",
        timestamp: Date.now()
      };
    }

    const agentMemory = ctx.memory as GoalMemory;
    const oldStatus = agentMemory.status;
    
    // Update status
    agentMemory.status = args.status;
    
    // Update current task if provided
    if (args.currentTask) {
      agentMemory.currentTask = args.currentTask;
      
      // Add task to task list if not already there
      if (!agentMemory.tasks.includes(args.currentTask)) {
        agentMemory.tasks.push(args.currentTask);
      }
    }
    
    // Update history
    agentMemory.history.push(`Status changed from ${oldStatus} to ${args.status}${args.currentTask ? ` with task "${args.currentTask}"` : ''}`);
    agentMemory.lastUpdated = Date.now();
    
    return {
      success: true,
      data: {
        oldStatus,
        newStatus: args.status,
        currentTask: agentMemory.currentTask
      },
      message: `Status updated to ${args.status}`,
      timestamp: Date.now()
    };
  }
});

// Create a task management action
const taskManagementAction = action({
  name: "manageTask",
  description: "Manages the current task in the goal system",
  instructions: "Use this to set a current task, mark a task as complete, or add notes about task progress",
  schema: z.object({
    operation: z.enum(["set", "complete", "note"]).describe("The operation to perform on the task"),
    task: z.string().describe("The task description or ID"),
    note: z.string().optional().describe("Additional notes about the task (for 'note' operation)"),
  }),
  handler(args, ctx, agent) {
    if (!ctx.memory) {
      return {
        success: false,
        error: "Agent memory not initialized",
        message: "Cannot manage task: agent memory is not initialized",
        timestamp: Date.now()
      };
    }

    const agentMemory = ctx.memory as GoalMemory;
    
    // Link the task to a specific goal if appropriate
    let relatedGoal: SingleGoal | null = null;
    
    // If we have goals, try to associate this task with a relevant goal
    if (agentMemory.goal) {
      const allGoals: SingleGoal[] = [
        ...(agentMemory.goal.short_term || []),
        ...(agentMemory.goal.medium_term || []),
        ...(agentMemory.goal.long_term || [])
      ];
      
      // Look for a goal that might be related to this task
      relatedGoal = allGoals.find(goal => 
        // Simple heuristic - check if the task description contains keywords from the goal
        goal.description && args.task.toLowerCase().includes(goal.description.toLowerCase())
      ) || null;
    }
    
    // Continue with the operation
    switch (args.operation) {
      case "set":
        // Set the current task
        agentMemory.currentTask = args.task;
        
        // Add to tasks list if not already there
        if (!agentMemory.tasks.includes(args.task)) {
          agentMemory.tasks.push(args.task);
        }
        
        // Add task to related goal's task list if we found a match
        if (relatedGoal && relatedGoal.id) {
          const goalEntry = `Added task "${args.task}" to goal "${relatedGoal.description}"`;
          agentMemory.history.push(goalEntry);
        }
        
        // Add to history
        agentMemory.history.push(`Set current task: "${args.task}"`);
        
        // Ensure status is 'executing' when setting a task
        if (agentMemory.status !== 'executing') {
          agentMemory.status = 'executing';
          agentMemory.history.push(`Status changed to executing`);
        }
        
        return {
          success: true,
          data: { 
            task: args.task,
            relatedGoal: relatedGoal ? {
              id: relatedGoal.id,
              description: relatedGoal.description
            } : null
          },
          message: `Current task set to "${args.task}"${relatedGoal ? ` (related to goal: ${relatedGoal.description})` : ''}`,
          timestamp: Date.now()
        };
        
      case "complete":
        // Find and remove the task from the list
        const taskIndex = agentMemory.tasks.indexOf(args.task);
        if (taskIndex !== -1) {
          agentMemory.tasks.splice(taskIndex, 1);
        }
        
        // If it was the current task, clear it
        if (agentMemory.currentTask === args.task) {
          agentMemory.currentTask = null;
          
          // If no more tasks, return to idle status
          if (agentMemory.tasks.length === 0) {
            agentMemory.status = 'idle';
            agentMemory.history.push(`Status changed to idle (all tasks complete)`);
          } else {
            // Otherwise, set the next task as current
            agentMemory.currentTask = agentMemory.tasks[0];
            agentMemory.history.push(`Next task set to "${agentMemory.currentTask}"`);
          }
        }
        
        // Add to history
        agentMemory.history.push(`Completed task: "${args.task}"`);
        
        return {
          success: true,
          data: { completedTask: args.task, nextTask: agentMemory.currentTask },
          message: `Task "${args.task}" marked as complete`,
          timestamp: Date.now()
        };
        
      case "note":
        // Add a note about the task in history
        const noteText = args.note || "No details provided";
        agentMemory.history.push(`Note on task "${args.task}": ${noteText}`);
        
        return {
          success: true,
          data: { task: args.task, note: noteText },
          message: `Added note to task "${args.task}"`,
          timestamp: Date.now()
        };
        
      default:
        return {
          success: false,
          error: `Unknown operation: ${args.operation}`,
          message: `Cannot manage task: unknown operation "${args.operation}"`,
          timestamp: Date.now()
        };
    }
  }
});

// Define basic context actions (without the goalActions that would cause a circular reference)
const contextActions = [updateStatusAction, taskManagementAction];

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
    let goalPlan = null;
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
        short_term: [],
        history: ["Initial goal created"]
      };
    }
    
    const initialMemory: GoalMemory = {
      goal: goalPlan,
      tasks: initialTaskList,
      currentTask: initialTaskList.length > 0 ? initialTaskList[0] : null,
      history: initialGoalText ? ["Initial goal and tasks created"] : [],
      lastUpdated: Date.now(),
      status: 'idle',
      competitiveIntelligence: null,
      lastCompetitiveAnalysis: null
    };
    
    return initialMemory;
  },

  // Optional: Function to render the context's state for the LLM prompt
  render: ({ memory }) => {
    const lastUpdatedTime = new Date(memory.lastUpdated).toISOString();
    
    // Prepare display values with proper string fallbacks
    const goalDisplay = memory.goal 
      ? JSON.stringify(memory.goal, null, 2) 
      : "No goals defined yet. Use the 'create-goal' action to define goals.";
    
    const tasksDisplay = memory.tasks.length > 0 
      ? memory.tasks.join("\n") 
      : "No tasks defined yet.";
    
    const currentTaskDisplay = memory.currentTask || "No task currently being executed.";
    
    // Only show the last 10 history items to keep context window manageable
    const historyItems = memory.history.slice(-10);
    const historyDisplay = historyItems.length > 0 
      ? historyItems.join("\n") 
      : "No history recorded yet.";
    
    // Add competitive intelligence as a separate section
    let competitiveIntelligence = "";
    if (memory.competitiveIntelligence && memory.lastCompetitiveAnalysis) {
      competitiveIntelligence = `## Competitive Intelligence
Last Analyzed: ${memory.lastCompetitiveAnalysis}`;
      
      // Add a summary of the competitive landscape if available
      const competitors = memory.competitiveIntelligence;
      if (typeof competitors === 'object' && competitors !== null) {
        const competitorCount = Object.keys(competitors).length;
        competitiveIntelligence += `\nTracking ${competitorCount} competitors`;
        
        // Add basic stats if available from last analysis
        if (memory.competitiveIntelligence.competitiveMetrics) {
          const metrics = memory.competitiveIntelligence.competitiveMetrics;
          competitiveIntelligence += `
- Total agents: ${metrics.totalAgents || 'Unknown'}
- Current rank: ${metrics.currentAgentRank || 'Unknown'} / ${metrics.totalAgents || 'Unknown'}
- Leading agent: ${metrics.leadingAgent || 'Unknown'}`;
        }
      }
    }
    
    // Use the render function with proper string values
    return render(template, {
      status: memory.status,
      lastUpdatedTime,
      goalDisplay,
      tasksDisplay,
      currentTaskDisplay,
      competitiveIntelligence,
      historyDisplay
    });
  },
  
  // Optional: Lifecycle hooks
  onStep: async (ctx, agent) => {
    // Logic to run on each step
    // e.g., update lastUpdated time
    ctx.memory.lastUpdated = Date.now();
  },
  
  onRun: async (ctx, agent) => {
    // Logic to run when the run completes
    const entry = `Run completed at ${new Date().toISOString()}`;
    ctx.memory.history.push(entry);
  },
  
  shouldContinue: (ctx) => {
    // Logic to determine if the run should continue
    // For goal management, we might want to stop if we're in idle state
    // and continue if we're in planning or executing
    return ctx.memory.status !== 'idle' || ctx.memory.currentTask !== null;
  },
  
  onError: async (error, ctx, agent) => {
    // Handle errors
    const errorEntry = `Error occurred: ${error instanceof Error ? error.message : String(error)}`;
    ctx.memory.history.push(errorEntry);
    // Set status back to idle on error
    ctx.memory.status = 'idle';
  },
  
  // Connect the combined actions to the context
  actions: contextActions,
  
  // Connect the imported outputs to the context
  outputs: {
    goalManager: goalManagerOutput
  },

  // Optional: Specify a default LLM for this context type
  // This allows you to use a specialized model for goal management if needed
  model: undefined, // Defaults to agent's model if undefined
  
  // Optional: Default limits for runs within this context
  maxSteps: 10, // Limit goal planning to 10 steps max by default
  maxWorkingMemorySize: 50, // Allow a larger working memory for complex goal structures
});