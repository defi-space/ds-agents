import { action } from "@daydreamsai/core";
import { z } from "zod";
import { 
  goalSchema, 
  goalPlanningSchema, 
  type SingleGoal, 
  type GoalMemory,
  type GoalTerm 
} from "../contexts/goal-context";
import { getCategoryAddresses } from "../utils/contracts";
import { getCurrentAgentId } from "../utils/starknet";
import { 
  getCompetitiveIntelligence, 
  analyzeCompetitorStrategies, 
  rankAgentsByHe3,
} from "../utils/competition";

export const goalActions = [
  action({
    name: "addTask",
    description: "Creates and adds a new task to the agent's long-term goal list. Automatically generates a unique task ID using timestamp and random string for tracking. Initializes the task with default priority and difficulty values, empty success criteria, and no dependencies. If the goal structure doesn't exist in memory, it creates the necessary hierarchy (long-term, medium-term, short-term goals).",
    schema: z.object({ 
      task: z.string().describe("The description of the task to be added to the goal list"),
      priority: z.number().min(1).max(10).optional().describe("Priority of the task (1-10)"),
      term: z.enum(["long_term", "medium_term", "short_term"]).optional().default("long_term")
    }),
    handler(call, ctx, agent) {
      if (!ctx.agentMemory) {
        return { error: "Agent memory not initialized", timestamp: Date.now() };
      }

      const agentMemory = ctx.agentMemory as GoalMemory;
      
      if (!agentMemory.goal) {
        agentMemory.goal = {
          long_term: [],
          medium_term: [],
          short_term: [],
          history: []
        };
      }

      const newTask: SingleGoal = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        description: call.data.task,
        success_criteria: [],
        dependencies: [],
        priority: call.data.priority ?? 1,
        required_resources: [],
        estimated_difficulty: 1,
        tasks: []
      };

      const term = call.data.term as GoalTerm;
      agentMemory.goal[term].push(newTask);
      
      // Initialize history array if it doesn't exist
      if (!agentMemory.history) {
        agentMemory.history = [];
      }
      
      // Update history
      agentMemory.history.push(`Added new ${term} task: ${call.data.task}`);
      agentMemory.lastUpdated = Date.now();
      
      return { 
        task: newTask,
        timestamp: Date.now()
      };
    },
  }),
  action({
    name: "setGoalPlan",
    description: "Set the complete goal planning structure including long-term, medium-term, and short-term goals",
    schema: z.object({ 
      goal: goalPlanningSchema,
      preserveHistory: z.boolean().optional().default(true)
    }),
    handler(call, ctx, agent) {
      const agentMemory = ctx.agentMemory as GoalMemory;
      const oldHistory = agentMemory.history;
      
      agentMemory.goal = call.data.goal;
      
      // Preserve history if requested
      if (call.data.preserveHistory) {
        agentMemory.history = oldHistory;
      } else if (!agentMemory.history) {
        // Initialize history array if it doesn't exist
        agentMemory.history = [];
      }
      
      // Add to history
      agentMemory.history.push("Updated complete goal plan");
      agentMemory.lastUpdated = Date.now();
      
      return {
        newGoal: call.data.goal,
        timestamp: Date.now()
      };
    },
  }),
  action({
    name: "updateGoal",
    description: "Update a specific goal's properties across any term (long, medium, short)",
    schema: z.object({ 
      goal: goalSchema,
      term: z.enum(["long_term", "medium_term", "short_term"]).optional()
    }),
    handler(call, ctx, agent) {
      const agentMemory = ctx.agentMemory as GoalMemory;
      
      if (!agentMemory.goal) {
        return { error: "No goals initialized" };
      }

      const terms: GoalTerm[] = call.data.term ? [call.data.term as GoalTerm] : ["long_term", "medium_term", "short_term"];
      let updated = false;

      for (const term of terms) {
        const goalIndex = agentMemory.goal[term].findIndex(
          (g: SingleGoal) => g.id === call.data.goal.id
        );

        if (goalIndex !== -1) {
          const oldGoal = agentMemory.goal[term][goalIndex];
          agentMemory.goal[term][goalIndex] = {
            ...oldGoal,
            ...call.data.goal
          };
          
          // Initialize history array if it doesn't exist
          if (!agentMemory.history) {
            agentMemory.history = [];
          }
          
          // Add to history
          agentMemory.history.push(`Updated ${term} goal: ${call.data.goal.description}`);
          agentMemory.lastUpdated = Date.now();
          
          updated = true;
          break;
        }
      }

      if (!updated) {
        return { error: `Goal with id ${call.data.goal.id} not found` };
      }

      return {
        goal: call.data.goal,
        timestamp: Date.now()
      };
    },
  }),
  action({
    name: "deleteGoal",
    description: "Delete a goal from any term by its ID",
    schema: z.object({
      goalId: z.string(),
      term: z.enum(["long_term", "medium_term", "short_term"]).optional()
    }),
    handler(call, ctx, agent) {
      const agentMemory = ctx.agentMemory as GoalMemory;
      
      if (!agentMemory.goal) {
        return { error: "No goals initialized" };
      }

      const terms: GoalTerm[] = call.data.term ? [call.data.term as GoalTerm] : ["long_term", "medium_term", "short_term"];
      let deleted = false;

      for (const term of terms) {
        const goalIndex = agentMemory.goal[term].findIndex(
          (g: SingleGoal) => g.id === call.data.goalId
        );

        if (goalIndex !== -1) {
          const deletedGoal = agentMemory.goal[term][goalIndex];
          agentMemory.goal[term].splice(goalIndex, 1);
          
          // Initialize history array if it doesn't exist
          if (!agentMemory.history) {
            agentMemory.history = [];
          }
          
          // Add to history
          agentMemory.history.push(`Deleted ${term} goal: ${deletedGoal.description}`);
          agentMemory.lastUpdated = Date.now();
          
          deleted = true;
          break;
        }
      }

      if (!deleted) {
        return { error: `Goal with id ${call.data.goalId} not found` };
      }

      return {
        success: true,
        timestamp: Date.now()
      };
    },
  }),
  action({
    name: "getCompetitiveIntelligence",
    description: "Retrieves comprehensive competitive intelligence about all agents in the game, including their resource balances, liquidity positions, staking positions, and strategies. This helps the agent adapt its strategy based on competitor actions.",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Get competitive intelligence using the utility function
        const competitiveIntelligence = await getCompetitiveIntelligence();
        
        // Get current agent's ID and address
        const currentAgentId = getCurrentAgentId();
        const agentAddresses = getCategoryAddresses('agents');
        const currentAgentAddress = agentAddresses[currentAgentId];
        
        // Calculate competitive metrics
        const competitiveMetrics = {
          totalAgents: Object.keys(agentAddresses).length,
          agentsWithData: Object.keys(competitiveIntelligence).length,
          leadingAgent: null as string | null,
          maxHe3Balance: "0",
          averageHe3Balance: "0",
          currentAgentRank: 1,
        };
        
        // Get ranked agents
        const rankedAgents = await rankAgentsByHe3();
        
        // Find leading agent and calculate average He3 balance
        if (rankedAgents.length > 0) {
          competitiveMetrics.leadingAgent = rankedAgents[0].agentId;
          competitiveMetrics.maxHe3Balance = rankedAgents[0].he3Balance;
          
          // Calculate average He3 balance
          let totalHe3Balance = BigInt(0);
          for (const agent of rankedAgents) {
            totalHe3Balance += BigInt(agent.he3Balance);
          }
          competitiveMetrics.averageHe3Balance = (totalHe3Balance / BigInt(rankedAgents.length)).toString();
          
          // Find current agent's rank
          competitiveMetrics.currentAgentRank = rankedAgents.findIndex(agent => agent.agentId === currentAgentId) + 1;
          if (competitiveMetrics.currentAgentRank === 0) {
            competitiveMetrics.currentAgentRank = rankedAgents.length + 1; // If not found, assume last
          }
        }
        
        return {
          success: true,
          data: {
            competitiveIntelligence,
            competitiveMetrics,
            timestamp: new Date().toISOString()
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get competitive intelligence:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get competitive intelligence",
          timestamp: Date.now(),
        };
      }
    },
  }),
  
  action({
    name: "detectCompetitorStrategies",
    description: "Analyzes competitor positions and transactions to detect their strategies and provide insights for counter-strategies.",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Get competitive intelligence using the utility function
        const competitiveIntelligence = await getCompetitiveIntelligence();
        
        // Analyze strategies for each competitor
        const strategicAnalysis = await analyzeCompetitorStrategies(competitiveIntelligence);
        
        return {
          success: true,
          data: {
            strategicAnalysis,
            timestamp: new Date().toISOString()
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to detect competitor strategies:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to detect competitor strategies",
          timestamp: Date.now(),
        };
      }
    },
  }),
]; 