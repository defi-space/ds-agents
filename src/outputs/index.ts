import { output } from "@daydreamsai/core";
import { z } from "zod";
import { 
  goalSchema, 
  goalPlanningSchema, 
  type SingleGoal, 
  type Goal, 
  type GoalMemory,
  type GoalTerm 
} from "../contexts/goal-context";
import { dashboardThought, dashboardAction, dashboardStatus } from "./dashboard";

export const outputs = {
  "goal-manager:state": output({
    description:
      "Use this when you need to update the goals. Use the goal id to update the goal. You should attempt the goal then call this to update the goal.",
    instructions: "Increment the state of the goal manager",
    schema: z.object({
      type: z
        .enum(["SET", "UPDATE"])
        .describe("SET to set the goals. UPDATE to update a goal."),
      goal: z.union([goalSchema, goalPlanningSchema]),
    }),
    handler: async (
      call: { type: "SET" | "UPDATE"; goal: SingleGoal | Goal }, 
      ctx: { memory: GoalMemory }, 
      agent
    ) => {
      const agentMemory = ctx.memory;
      
      if (call.type === "SET") {
        // Set the entire goal structure
        if ('long_term' in call.goal) {
          // Initialize history if it doesn't exist
          const newGoal = {
            ...call.goal,
            history: call.goal.history ?? []
          };
          agentMemory.goal = newGoal;
          
          // Initialize history array if it doesn't exist
          if (!agentMemory.history) {
            agentMemory.history = [];
          }
          
          agentMemory.history.push("Set new complete goal plan");
        } else {
          throw new Error("SET operation requires a complete goal structure with long_term, medium_term, and short_term arrays");
        }
      } else if (call.type === "UPDATE") {
        // Find and update the specific goal across all terms
        const goal = call.goal as SingleGoal;
        
        // Check if goals exist, if not initialize an empty goal structure
        if (!agentMemory.goal) {
          // Initialize with empty arrays for each term
          agentMemory.goal = {
            long_term: [],
            medium_term: [],
            short_term: [],
            history: []
          };
          
          // Initialize history array if it doesn't exist
          if (!agentMemory.history) {
            agentMemory.history = [];
          }
          
          agentMemory.history.push("Initialized empty goal structure");
          
          // If we're trying to update a goal but none exist, add this goal to short_term
          agentMemory.goal.short_term.push(goal);
          agentMemory.history.push(`Added first goal to short_term: ${goal.description}`);
          
          // No need to continue with the update logic since we just added the goal
          agentMemory.lastUpdated = Date.now();
          return {
            data: {
              goal: agentMemory.goal,
              history: agentMemory.history,
              lastUpdated: agentMemory.lastUpdated
            },
            timestamp: Date.now(),
          };
        }
        
        // Search in all term categories
        const terms: GoalTerm[] = ['long_term', 'medium_term', 'short_term'];
        let found = false;
        
        for (const term of terms) {
          const goalIndex = agentMemory.goal[term].findIndex((g: SingleGoal) => g.id === goal.id);
          if (goalIndex !== -1) {
            const oldGoal = agentMemory.goal[term][goalIndex];
            agentMemory.goal[term][goalIndex] = {
              ...oldGoal,
              ...goal
            };
            
            // Initialize history array if it doesn't exist
            if (!agentMemory.history) {
              agentMemory.history = [];
            }
            
            agentMemory.history.push(`Updated ${term} goal: ${goal.description}`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          // If goal not found, add it to short_term goals
          agentMemory.goal.short_term.push(goal);
          agentMemory.history.push(`Added new goal to short_term: ${goal.description}`);
        }
      }

      // Update timestamp
      agentMemory.lastUpdated = Date.now();

      return {
        data: {
          goal: agentMemory.goal,
          history: agentMemory.history,
          lastUpdated: agentMemory.lastUpdated
        },
        timestamp: Date.now(),
      };
    },
  }),
  
  // Add dashboard outputs
  "dashboard:thought": dashboardThought,
  "dashboard:action": dashboardAction,
  "dashboard:status": dashboardStatus
};
