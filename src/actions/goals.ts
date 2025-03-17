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
    description: "Creates and adds a new task to the agent's goal list. The task will be categorized based on the specified term (long, medium, or short). Example: addTask({ task: 'Research new DeFi protocols', priority: 8, term: 'medium_term' })",
    schema: z.object({ 
      task: z.string().describe("The description of the task to be added to the goal list"),
      priority: z.number().min(1).max(10).optional().default(5).describe("Priority of the task (1-10)"),
      term: z.enum(["long_term", "medium_term", "short_term"]).default("long_term").describe("The timeframe category for this task")
    }),
    handler(call, ctx, agent) {
      if (!ctx.agentMemory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot add task: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }

      const agentMemory = ctx.agentMemory as GoalMemory;
      
      // Initialize goal structure if it doesn't exist
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
        priority: call.data.priority ?? 5, // Use default from schema
        required_resources: [],
        estimated_difficulty: 1,
        tasks: []
      };

      const term = call.data.term as GoalTerm;
      agentMemory.goal[term].push(newTask);
      
      // Initialize history array if it doesn't exist
      agentMemory.history = agentMemory.history || [];
      
      // Update history
      agentMemory.history.push(`Added new ${term} task: ${call.data.task}`);
      agentMemory.lastUpdated = Date.now();
      
      return { 
        success: true,
        data: {
          task: newTask,
          term: term
        },
        message: `Successfully added new ${term} task: ${call.data.task}`,
        timestamp: Date.now()
      };
    },
  }),
  
  action({
    name: "setGoalPlan",
    description: "Sets the complete goal planning structure including long-term, medium-term, and short-term goals. Can optionally preserve existing history. Example: setGoalPlan({ goal: { long_term: [], medium_term: [], short_term: [] }, preserveHistory: true })",
    schema: z.object({ 
      goal: goalPlanningSchema.describe("The complete goal structure with long_term, medium_term, and short_term goals"),
      preserveHistory: z.boolean().optional().default(true).describe("Whether to preserve existing history entries")
    }),
    handler(call, ctx, agent) {
      if (!ctx.agentMemory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot set goal plan: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }
      
      const agentMemory = ctx.agentMemory as GoalMemory;
      const oldHistory = agentMemory.history || [];
      
      // Set the new goal structure
      agentMemory.goal = call.data.goal;
      
      // Preserve history if requested
      if (call.data.preserveHistory) {
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
          newGoal: call.data.goal,
        },
        message: "Successfully updated the complete goal plan",
        timestamp: Date.now()
      };
    },
  }),
  
  action({
    name: "updateGoal",
    description: "Updates a specific goal's properties by ID, optionally specifying which term to search (long, medium, short). If term is not specified, all terms will be searched. Example: updateGoal({ goal: { id: 'task_123', description: 'Updated task' }, term: 'short_term' })",
    schema: z.object({ 
      goal: goalSchema.describe("The goal object with updated fields (must include id)"),
      term: z.enum(["long_term", "medium_term", "short_term"]).optional().describe("Optional term to specify where the goal is located")
    }),
    handler(call, ctx, agent) {
      if (!ctx.agentMemory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot update goal: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }
      
      const agentMemory = ctx.agentMemory as GoalMemory;
      
      if (!agentMemory.goal) {
        return { 
          success: false,
          error: "No goals initialized",
          message: "Cannot update goal: no goals have been initialized yet",
          timestamp: Date.now()
        };
      }

      const terms: GoalTerm[] = call.data.term ? [call.data.term as GoalTerm] : ["long_term", "medium_term", "short_term"];
      let updated = false;
      let updatedGoal = null;
      let updatedTerm = null;

      for (const term of terms) {
        const goalIndex = agentMemory.goal[term].findIndex(
          (g: SingleGoal) => g.id === call.data.goal.id
        );

        if (goalIndex !== -1) {
          const oldGoal = agentMemory.goal[term][goalIndex];
          updatedGoal = {
            ...oldGoal,
            ...call.data.goal
          };
          
          agentMemory.goal[term][goalIndex] = updatedGoal;
          
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
          error: `Goal with id ${call.data.goal.id} not found`,
          message: `Cannot update goal: no goal with ID ${call.data.goal.id} was found`,
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
  }),
  
  action({
    name: "deleteGoal",
    description: "Deletes a goal by its ID, optionally specifying which term to search (long, medium, short). If term is not specified, all terms will be searched. Example: deleteGoal({ goalId: 'task_123', term: 'short_term' })",
    schema: z.object({
      goalId: z.string().describe("The unique ID of the goal to delete"),
      term: z.enum(["long_term", "medium_term", "short_term"]).optional().describe("Optional term to specify where the goal is located")
    }),
    handler(call, ctx, agent) {
      if (!ctx.agentMemory) {
        return { 
          success: false,
          error: "Agent memory not initialized", 
          message: "Cannot delete goal: agent memory is not initialized",
          timestamp: Date.now() 
        };
      }
      
      const agentMemory = ctx.agentMemory as GoalMemory;
      
      if (!agentMemory.goal) {
        return { 
          success: false, 
          error: "No goals initialized",
          message: "Cannot delete goal: no goals have been initialized yet",
          timestamp: Date.now()
        };
      }

      const terms: GoalTerm[] = call.data.term ? [call.data.term as GoalTerm] : ["long_term", "medium_term", "short_term"];
      let deleted = false;
      let deletedGoal = null;
      let deletedTerm = null;

      for (const term of terms) {
        const goalIndex = agentMemory.goal[term].findIndex(
          (g: SingleGoal) => g.id === call.data.goalId
        );

        if (goalIndex !== -1) {
          deletedGoal = agentMemory.goal[term][goalIndex];
          agentMemory.goal[term].splice(goalIndex, 1);
          
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
          error: `Goal with id ${call.data.goalId} not found`,
          message: `Cannot delete goal: no goal with ID ${call.data.goalId} was found`,
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
  }),
  
  action({
    name: "getCompetitiveIntelligence",
    description: "Retrieves comprehensive competitive intelligence about all agents in the game, including resource balances, positions, and strategies. Example: getCompetitiveIntelligence()",
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
  }),
  
  action({
    name: "analyzeCompetitorStrategies",
    description: "Analyzes competitor positions and transactions to detect their strategies and provide insights for counter-strategies. Example: analyzeCompetitorStrategies()",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Get competitive intelligence using the utility function
        const competitiveIntelligence = await getCompetitiveIntelligence();
        
        // Update context with intelligence data
        if (ctx.agentMemory) {
          ctx.agentMemory.competitiveIntelligence = competitiveIntelligence;
          ctx.agentMemory.lastCompetitiveAnalysis = new Date().toISOString();
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
  }),
]; 