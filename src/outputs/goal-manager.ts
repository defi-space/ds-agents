import { output } from "@daydreamsai/core";
import { z } from "zod";
import { 
  type SingleGoal, 
  type Goal, 
  type GoalMemory,
  type GoalTerm 
} from "../contexts/goal-context";
import { goalPlanningSchema, goalSchema } from "../schema/goal-schema";


// Define the output schema 
const outputSchema = z.object({
  type: z
    .enum(["SET", "UPDATE"])
    .default("UPDATE")
    .describe("SET to set the goals. UPDATE to update a goal."),
  goal: z.union([goalSchema, goalPlanningSchema])
    .optional()
    .default(() => ({ 
      id: `goal_${Date.now()}`,
      description: "Default goal",
      success_criteria: [],
      dependencies: [],
      priority: 5,
      required_resources: [],
      estimated_difficulty: 1,
      tasks: []
    })),
});

export const goalManagerOutput = output({
  description:
    "Use this when you need to update the goals. Use the goal id to update the goal. You can set or update goal information through this output.",
  instructions: "Specify either SET to replace the entire goal structure or UPDATE to modify a specific goal.",
  schema: outputSchema,
  handler: async (
    args: { type: "SET" | "UPDATE"; goal: SingleGoal | Goal }, 
    ctx: { memory: GoalMemory }, 
    agent
  ) => {
    const agentMemory = ctx.memory;
    
    // Initialize the memory structure if not present
    if (!agentMemory.goal) {
      agentMemory.goal = {
        long_term: [],
        medium_term: [],
        short_term: [],
        history: []
      };
    }
    
    if (!agentMemory.history) {
      agentMemory.history = [];
    }
    
    // Track what changed for return value
    const changes = {
      operation: args.type,
      goalsAdded: 0,
      goalsUpdated: 0,
      affectedTerms: new Set<string>()
    };
    
    if (args.type === "SET") {
      // Set the entire goal structure
      if ('long_term' in args.goal) {
        // Initialize history if it doesn't exist
        const newGoal = {
          ...args.goal,
          history: args.goal.history ?? []
        };
        
        // Count the goals in each term for reporting
        changes.goalsAdded = (
          newGoal.long_term.length + 
          newGoal.medium_term.length + 
          newGoal.short_term.length
        );
        
        // Track which terms have goals
        if (newGoal.long_term.length > 0) changes.affectedTerms.add('long_term');
        if (newGoal.medium_term.length > 0) changes.affectedTerms.add('medium_term');
        if (newGoal.short_term.length > 0) changes.affectedTerms.add('short_term');
        
        // Update the goal structure
        agentMemory.goal = newGoal;
        agentMemory.history.push("Set new complete goal plan");
      } else {
        throw new Error("SET operation requires a complete goal structure with long_term, medium_term, and short_term arrays");
      }
    } else if (args.type === "UPDATE") {
      // Find and update the specific goal across all terms
      const goal = args.goal as SingleGoal;
      
      // If we're trying to update a goal but none exist, add this goal to short_term
      if (!agentMemory.goal.short_term) {
        agentMemory.goal.short_term = [];
      }
      
      if (goal && goal.id) {
        // Search in all term categories
        const terms: GoalTerm[] = ['long_term', 'medium_term', 'short_term'];
        let found = false;
        
        for (const term of terms) {
          if (!agentMemory.goal[term]) {
            agentMemory.goal[term] = [];
            continue;
          }
          
          const goalIndex = agentMemory.goal[term].findIndex((g: SingleGoal) => g.id === goal.id);
          if (goalIndex !== -1) {
            const oldGoal = agentMemory.goal[term][goalIndex];
            agentMemory.goal[term][goalIndex] = {
              ...oldGoal,
              ...goal
            };
            
            agentMemory.history.push(`Updated ${term} goal: ${goal.description}`);
            found = true;
            changes.goalsUpdated++;
            changes.affectedTerms.add(term);
            break;
          }
        }
        
        if (!found) {
          // If goal not found, add it to short_term goals
          agentMemory.goal.short_term.push(goal);
          agentMemory.history.push(`Added new goal to short_term: ${goal.description}`);
          changes.goalsAdded++;
          changes.affectedTerms.add('short_term');
        }
      } else {
        // If no valid goal provided, just update the timestamp
        agentMemory.history.push(`Goal manager queried with no specific goal`);
      }
    }

    // Update timestamp
    agentMemory.lastUpdated = Date.now();

    return {
      data: {
        goal: agentMemory.goal,
        history: agentMemory.history.slice(-5),  // Only return the last 5 history items
        lastUpdated: agentMemory.lastUpdated,
        changes: {
          ...changes,
          affectedTerms: Array.from(changes.affectedTerms)  // Convert Set to Array for serialization
        }
      },
      timestamp: Date.now(),
    };
  },
}); 