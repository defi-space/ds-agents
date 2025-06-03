import { action, z } from "@daydreamsai/core";
import { DS_CONTEXT } from "../contexts/ds-context";
import { getCurrentAgentId } from "../utils/starknet";
import {
  getAgentData,
  compareAgents,
  rankAgentsByHe3,
  rankAgentsByProgression,
} from "../utils/competition";

export const toolActions = [
  action({
    name: "getDefiSpaceContext",
    description: "Retrieves the context of the defi.space game",
    instructions:
      "Use this action when you need to understand the game rules and protocol parameters",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler(_args, _ctx, _agent) {
      return {
        success: true,
        message: "Successfully retrieved complete defi.space context",
        data: DS_CONTEXT,
        timestamp: Date.now(),
      };
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Context retrieval failed:", error);
      ctx.emit("contextRetrievalError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getAgentData",
    description:
      "Retrieves comprehensive data about an agent including balances, positions, game stage, and strategy",
    instructions:
      "Use this action when you need to know the current state of an agent, including their balances, positions, game stage, and strategy",
    schema: z.object({
      agentId: z
        .string()
        .describe("Agent ID to analyze (defaults to current agent if not provided)")
        .optional(),
    }),
    async handler(args, _ctx, _agent) {
      try {
        const agentId = args.agentId || getCurrentAgentId();

        if (!agentId) {
          return {
            success: false,
            message: "Failed to get agent data: could not determine agent ID",
            timestamp: Date.now(),
          };
        }

        const agentData = await getAgentData(agentId);

        return {
          success: true,
          message: `Successfully retrieved comprehensive data for agent ${agentId}`,
          data: {
            agentData,
            summary: {
              gameStage: agentData.gameStage,
              strategyFocus: agentData.strategyFocus,
              he3Balance: `${Number(BigInt(agentData.he3Balance)) / 1e18} He3`,
              totalPositions: agentData.liquidityPositions + agentData.farmPositions,
              progressToVictory: `${Math.min(100, Number((BigInt(agentData.he3Balance) * 100n) / 7000000000000000000000000n))}%`,
            },
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to get agent data: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Agent data query failed:", error);
      ctx.emit("agentDataError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "compareAgents",
    description: "Provides comprehensive head-to-head comparison between two agents",
    instructions:
      "Use this action when you need to compare yourself with another agent, including their balances, positions, game stage, and strategy",
    schema: z.object({
      competitorAgentId: z.string().describe("Agent ID to compare"),
    }),
    async handler(args, _ctx, _agent) {
      try {
        const { competitorAgentId } = args;

        const agentId = getCurrentAgentId();

        if (competitorAgentId === agentId) {
          return {
            success: false,
            message: "Cannot compare: both agent IDs are the same",
            timestamp: Date.now(),
          };
        }

        const comparison = await compareAgents(agentId, competitorAgentId);

        // Create a summary for easier understanding
        const summary = {
          overall_winner: comparison.winner.overall,
          he3_leader: comparison.winner.he3,
          strategic_leader: comparison.winner.strategy,
          game_stages: `${agentId}: ${comparison.agent1.gameStage}, ${competitorAgentId}: ${comparison.agent2.gameStage}`,
          strategy_focus: `${agentId}: ${comparison.agent1.strategyFocus}, ${competitorAgentId}: ${comparison.agent2.strategyFocus}`,
          key_insights: comparison.differences,
          strategic_analysis: comparison.strategicAnalysis,
        };

        return {
          success: true,
          message: `Successfully compared agents ${agentId} and ${competitorAgentId}`,
          data: {
            comparison,
            summary,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to compare agents: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Agent comparison failed:", error);
      ctx.emit("agentComparisonError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "rankAgentsByHe3",
    description: "Retrieves a ranked leaderboard of all agents based on He3 balance",
    instructions:
      "Use this action when you need to know the current state of the leaderboard, including the top agents by He3 balance",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    async handler(_args, _ctx, _agent) {
      try {
        const rankings = await rankAgentsByHe3();

        // Create summary with key insights
        const summary = {
          total_agents: rankings.length,
          leader: rankings[0]?.agentId || "None",
          leader_he3: rankings[0] ? `${Number(BigInt(rankings[0].he3Balance)) / 1e18} He3` : "0",
          leader_progress: rankings[0]?.progressToGoal || 0,
          victory_threshold: "7,000,000 He3",
          agents_with_he3: rankings.filter((r) => BigInt(r.he3Balance) > 0n).length,
        };

        return {
          success: true,
          message: `Successfully ranked ${rankings.length} agents by He3 balance`,
          data: {
            rankings,
            summary,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to rank agents by He3: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("He3 ranking failed:", error);
      ctx.emit("he3RankingError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "rankAgentsByProgression",
    description: "Retrieves a comprehensive ranking of agents based on overall game progression",
    instructions:
      "Use this action when you need to know the current state of the leaderboard, including the top agents by overall game progression",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    async handler(_args, _ctx, _agent) {
      try {
        const progressionRankings = await rankAgentsByProgression();

        // Create summary with insights
        const summary = {
          total_agents: progressionRankings.length,
          top_performer: progressionRankings[0]?.agentId || "None",
          top_score: progressionRankings[0]?.score || 0,
          game_stages: {
            endgame: progressionRankings.filter((r) => r.gameStage === "endgame").length,
            advanced: progressionRankings.filter((r) => r.gameStage === "advanced").length,
            mid: progressionRankings.filter((r) => r.gameStage === "mid").length,
            early: progressionRankings.filter((r) => r.gameStage === "early").length,
          },
          strategy_distribution: {
            he3_farming: progressionRankings.filter((r) => r.strategyFocus === "he3_farming")
              .length,
            balanced: progressionRankings.filter((r) => r.strategyFocus === "balanced").length,
            carbon_path: progressionRankings.filter((r) => r.strategyFocus === "carbon_path")
              .length,
            neodymium_path: progressionRankings.filter((r) => r.strategyFocus === "neodymium_path")
              .length,
          },
        };

        return {
          success: true,
          message: `Successfully ranked ${progressionRankings.length} agents by overall progression`,
          data: {
            rankings: progressionRankings,
            summary,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to rank agents by progression: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Progression ranking failed:", error);
      ctx.emit("progressionRankingError", { action: ctx.call.name, error: error.message });
    },
  }),
];
