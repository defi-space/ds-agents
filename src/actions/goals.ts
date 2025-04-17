import { action } from "@daydreamsai/core";
import { z } from "zod";
import { 
  type GoalMemory
} from "../contexts/goal-context";
import { 
  goalPlanningSchema, 
  goalSchema, 
  type SingleGoal,
  type GoalTerm,
  type GoalsStructure
} from "../schema/goal-schema";
import { getCategoryAddresses } from "../utils/contracts";
import { getCurrentAgentId } from "../utils/starknet";
import { 
  getCompetitiveIntelligence, 
  analyzeCompetitorStrategies, 
  rankAgentsByHe3,
  generateStrategyInspiration,
  suggestCounterStrategies
} from "../utils/competition";

export const goalActions = [
  action({
    name: "addTask",
    description: "Creates and adds a new task to the agent's goal list",
    instructions: "Use this action when an agent needs to add a new task to their goals with specific priority and timeframe",
    schema: z.object({ 
      task: z.string().describe("Description of the task to add to the goal list"),
      priority: z.number().min(1).max(10).optional().default(5).describe("Priority level from 1 (lowest) to 10 (highest)"),
      term: z.enum(["long_term", "medium_term", "short_term"]).default("long_term").describe("Timeframe category for the task")
    }),
    handler(args, ctx, agent) {
      if (!ctx.memory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot add task: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }

      const agentMemory = ctx.memory as GoalMemory;
      
      // Initialize goal structure if it doesn't exist
      if (!agentMemory.goals) {
        agentMemory.goals = {
          long_term: [],
          medium_term: [],
          short_term: []
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
        tasks: []
      };

      const term = args.term as GoalTerm;
      agentMemory.goals[term].push(newTask);
      
      // Initialize history array if it doesn't exist
      agentMemory.history = agentMemory.history || [];
      
      // Update history
      agentMemory.history.push(`Added new ${term} task: ${args.task}`);
      agentMemory.lastUpdated = Date.now();
      
      return { 
        success: true,
        data: {
          task: newTask,
          term: term,
          goalState: {
            taskCount: agentMemory.goals[term].length,
            status: agentMemory.status
          }
        },
        message: `Successfully added new ${term} task: ${args.task}`,
        timestamp: Date.now()
      };
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Task addition failed:`, error);
      ctx.emit("taskAdditionError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "setGoalPlan",
    description: "Sets the complete goal planning structure for an agent",
    instructions: "Use this action when an agent needs to establish or completely replace their entire goal structure",
    schema: z.object({ 
      goal: goalPlanningSchema.describe("Complete goal structure with long_term, medium_term, and short_term goals"),
      preserveHistory: z.boolean().optional().default(true).describe("Whether to retain existing history entries (true) or clear them (false)")
    }),
    handler(args, ctx, agent) {
      if (!ctx.memory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot set goal plan: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }
      
      const agentMemory = ctx.memory as GoalMemory;
      const oldHistory = agentMemory.history || [];
      
      // Set the new goal structure - need to convert from goalPlanningSchema to GoalStructure format
      const newGoals: GoalsStructure = {
        long_term: args.goal.long_term || [],
        medium_term: args.goal.medium_term || [],
        short_term: args.goal.short_term || []
      };
      
      // Update the goals
      agentMemory.goals = newGoals;
      
      // Preserve history if requested
      if (args.preserveHistory) {
        agentMemory.history = oldHistory;
      } else {
        // Initialize history array if it doesn't exist or if not preserving
        agentMemory.history = [];
      }
      
      // Add to history
      agentMemory.history.push("Updated complete goal plan");
      agentMemory.lastUpdated = Date.now();
      
      return {
        success: true,
        data: {
          newGoals,
        },
        message: "Successfully updated the complete goal plan",
        timestamp: Date.now()
      };
    },
    format: (result) => {
      if (!result.data || result.data.success === false) {
        return `Failed to set goal plan: ${result.data?.error || "Unknown error"}`;
      }
      
      const goalData = result.data.data?.newGoals;
      if (!goalData) return "Goal plan updated.";
      
      const longTermCount = goalData.long_term?.length || 0;
      const mediumTermCount = goalData.medium_term?.length || 0;
      const shortTermCount = goalData.short_term?.length || 0;
      
      return `Goal plan updated with ${longTermCount} long-term, ${mediumTermCount} medium-term, and ${shortTermCount} short-term goals.`;
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Goal plan update failed:`, error);
      ctx.emit("goalPlanError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "updateGoal",
    description: "Updates properties of a specific goal by ID",
    instructions: "Use this action when an agent needs to modify an existing goal's attributes like description or priority",
    schema: z.object({ 
      goal: goalSchema.describe("Goal object with the updated fields (must include the goal's id)"),
      term: z.enum(["long_term", "medium_term", "short_term"]).optional().describe("Timeframe category where the goal is located (if known)")
    }),
    handler(args, ctx, agent) {
      if (!ctx.memory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot update goal: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }
      
      const agentMemory = ctx.memory as GoalMemory;
      
      if (!agentMemory.goals) {
        return { 
          success: false,
          error: "No goals initialized",
          message: "Cannot update goal: no goals have been initialized yet",
          timestamp: Date.now()
        };
      }

      const terms: GoalTerm[] = args.term ? [args.term as GoalTerm] : ["long_term", "medium_term", "short_term"];
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
            ...args.goal
          };
          
          agentMemory.goals[term][goalIndex] = updatedGoal;
          
          // Initialize history array if it doesn't exist
          agentMemory.history = agentMemory.history || [];
          
          // Add to history
          agentMemory.history.push(`Updated ${term} goal: ${updatedGoal.description}`);
          agentMemory.lastUpdated = Date.now();
          
          updated = true;
          updatedTerm = term;
          break;
        }
      }

      if (!updated) {
        return { 
          success: false,
          error: `Goal with id ${args.goal.id} not found`,
          message: `Cannot update goal: no goal with ID ${args.goal.id} was found`,
          timestamp: Date.now()
        };
      }

      return {
        success: true,
        data: {
          goal: updatedGoal,
          term: updatedTerm
        },
        message: `Successfully updated ${updatedTerm} goal: ${updatedGoal?.description}`,
        timestamp: Date.now()
      };
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Goal update failed:`, error);
      ctx.emit("goalUpdateError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "deleteGoal",
    description: "Removes a goal from the agent's goal list",
    instructions: "Use this action when an agent needs to remove a goal that is no longer relevant or has been completed",
    schema: z.object({
      goalId: z.string().describe("Unique ID of the goal to delete"),
      term: z.enum(["long_term", "medium_term", "short_term"]).optional().describe("Timeframe category where the goal is located (if known)")
    }),
    handler(args, ctx, agent) {
      if (!ctx.memory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot delete goal: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }
      
      const agentMemory = ctx.memory as GoalMemory;
      
      if (!agentMemory.goals) {
        return { 
          success: false, 
          error: "No goals initialized",
          message: "Cannot delete goal: no goals have been initialized yet",
          timestamp: Date.now()
        };
      }

      const terms: GoalTerm[] = args.term ? [args.term as GoalTerm] : ["long_term", "medium_term", "short_term"];
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
          
          // Initialize history array if it doesn't exist
          agentMemory.history = agentMemory.history || [];
          
          // Add to history
          agentMemory.history.push(`Deleted ${term} goal: ${deletedGoal.description}`);
          agentMemory.lastUpdated = Date.now();
          
          deleted = true;
          deletedTerm = term;
          break;
        }
      }

      if (!deleted) {
        return { 
          success: false,
          error: `Goal with id ${args.goalId} not found`,
          message: `Cannot delete goal: no goal with ID ${args.goalId} was found`,
          timestamp: Date.now()
        };
      }

      return {
        success: true,
        data: {
          deletedGoal,
          term: deletedTerm
        },
        message: `Successfully deleted ${deletedTerm} goal: ${deletedGoal?.description || "unknown goal"}`,
        timestamp: Date.now()
      };
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Goal deletion failed:`, error);
      ctx.emit("goalDeletionError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "getCompetitiveIntelligence",
    description: "Retrieves information about all agents in the game",
    instructions: "Use this action when an agent needs to understand the competitive landscape and compare their position to other agents",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
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
          message: `Retrieved competitive intelligence on ${competitiveMetrics.agentsWithData} agents. Current rank: ${competitiveMetrics.currentAgentRank} of ${competitiveMetrics.totalAgents}.`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get competitive intelligence:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get competitive intelligence",
          message: `Failed to retrieve competitive intelligence: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Intelligence gathering failed:`, error);
      ctx.emit("intelligenceError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "analyzeCompetitorStrategies",
    description: "Identifies strategies used by competing agents",
    instructions: "Use this action when an agent needs to understand what strategies other agents are employing and develop counter-strategies",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Get competitive intelligence using the utility function
        const competitiveIntelligence = await getCompetitiveIntelligence();
        
        // Update context with intelligence data
        if (ctx.memory) {
          const agentMemory = ctx.memory as GoalMemory;
          agentMemory.competitiveIntelligence = competitiveIntelligence;
          agentMemory.lastCompetitiveAnalysis = new Date().toISOString();
        }
        
        // Analyze strategies for each competitor
        const strategicAnalysis = await analyzeCompetitorStrategies(competitiveIntelligence);
        
        return {
          success: true,
          data: {
            strategicAnalysis,
            timestamp: new Date().toISOString()
          },
          message: `Successfully analyzed strategies for ${Object.keys(strategicAnalysis).length} competitors`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to detect competitor strategies:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to detect competitor strategies",
          message: `Failed to analyze competitor strategies: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Strategy analysis failed:`, error);
      ctx.emit("strategyAnalysisError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "generateStrategyInspiration",
    description: "Generates creative strategy inspiration based on competitive analysis",
    instructions: "Use this action when an agent needs to think creatively about strategy options",
    schema: z.object({
      agentId: z.string().describe("Agent ID to analyze (defaults to all competitors if not provided)").optional()
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Get competitive intelligence
        const competitiveIntelligence = await getCompetitiveIntelligence();
        
        // Get target agent (or pick the leading agent if not specified)
        let targetAgentId = args.agentId;
        
        if (!targetAgentId) {
          // Get ranked agents and use the leading one
          const rankedAgents = await rankAgentsByHe3();
          if (rankedAgents.length > 0) {
            targetAgentId = rankedAgents[0].agentId;
          }
        }
        
        // If we still don't have a target, use the first available agent
        if (!targetAgentId && Object.keys(competitiveIntelligence).length > 0) {
          targetAgentId = Object.keys(competitiveIntelligence)[0];
        }
        
        if (!targetAgentId) {
          return {
            success: false,
            error: "No target agent found for analysis",
            message: "Failed to generate strategy inspiration: no target agent found",
            timestamp: Date.now()
          };
        }
        
        // Get agent data
        const targetAgentData = competitiveIntelligence[targetAgentId];
        
        if (!targetAgentData) {
          return {
            success: false,
            error: `Agent data not found for ID: ${targetAgentId}`,
            message: `Failed to generate strategy inspiration: agent data not found for ID ${targetAgentId}`,
            timestamp: Date.now()
          };
        }
        
        // Generate counter-strategies analysis
        const competitorAnalysis = suggestCounterStrategies(
          targetAgentData.resourceBalances,
          targetAgentData.liquidityPositions,
          targetAgentData.stakePositions,
          targetAgentData.he3Balance
        );
        
        // Generate creative strategy inspiration based on the analysis
        const strategyInspiration = generateStrategyInspiration(competitorAnalysis);
        
        return {
          success: true,
          data: {
            targetAgentId,
            strategyInspiration,
            timestamp: new Date().toISOString()
          },
          message: `Generated creative strategy inspiration based on analysis of agent ${targetAgentId}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to generate strategy inspiration:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to generate strategy inspiration",
          message: `Failed to generate strategy inspiration: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Strategy inspiration generation failed:`, error);
      ctx.emit("strategyInspirationError", { action: ctx.call.name, error: error.message });
    }
  }),
]; 