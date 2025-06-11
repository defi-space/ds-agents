import { action, z } from "@daydreamsai/core";
import { DS_CONTEXT } from "../contexts/ds-context";
import { getCurrentAgentId } from "../utils/starknet";
import {
  getAgentProgressionData,
  compareAgents,
  rankAgentsByProgression,
} from "../utils/competition";
import { availableAgentIds } from "../utils/contracts";
import contractAddresses from "../../contracts.json";

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
        data: {
          context: DS_CONTEXT,
        },
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
    name: "getAgentProgressionData",
    description:
      "Retrieves comprehensive data about an agent including balances and activity scores",
    instructions:
      "Use this action when you need to analyze an agent's current state and progression",
    schema: z.object({
      agentIndex: z.enum(availableAgentIds).describe("Agent ID to analyze."),
    }),
    async handler(args, _ctx, _agent) {
      try {
        const progressionData = await getAgentProgressionData(args.agentIndex);

        return {
          success: true,
          message: `Successfully retrieved progression data for ${args.agentIndex}`,
          data: {
            agent: args.agentIndex,
            progressionData,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to get agent progression data: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Agent progression data query failed:", error);
      ctx.emit("agentProgressionDataError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "compareAgents",
    description: "Compares two agents across all progression metrics",
    instructions: "Use this action when you need to compare yourself with another agent",
    schema: z.object({
      competitorAgentIndex: z.enum(availableAgentIds).describe("Agent ID to compare against."),
    }),
    async handler(args, _ctx, _agent) {
      try {
        const agentIndex = getCurrentAgentId();

        if (args.competitorAgentIndex === agentIndex) {
          return {
            success: false,
            message: "Cannot compare: both agent IDs are the same",
            timestamp: Date.now(),
          };
        }

        const comparison = await compareAgents(agentIndex, args.competitorAgentIndex);

        return {
          success: true,
          message: `Successfully compared agents ${agentIndex} and ${args.competitorAgentIndex}`,
          data: {
            agent: agentIndex,
            competitorAgent: args.competitorAgentIndex,
            comparison,
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
    name: "rankAgentsByProgression",
    description: "Retrieves a ranking of all agents based on their progression scores",
    instructions: "Use this action when you need to see the current leaderboard",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    async handler(_args, _ctx, _agent) {
      try {
        const progressionRankings = await rankAgentsByProgression();

        return {
          success: true,
          message: `Successfully ranked ${progressionRankings.length} agents by progression`,
          data: {
            rankings: progressionRankings,
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

  action({
    name: "compareTimestamps",
    description: "Gets current timestamp and compares it with a provided timestamp",
    instructions: "Use this action when you need to check time differences or validate timestamps",
    schema: z.object({
      timestamp: z.number().describe("Timestamp to compare with current time in milliseconds"),
    }),
    handler(args, _ctx, _agent) {
      const currentTimestamp = Date.now();
      const timeDiffMs = currentTimestamp - args.timestamp;
      const minutesDiff = Math.ceil(Math.abs(timeDiffMs) / (1000 * 60));

      const isInPast = timeDiffMs > 0;

      return {
        success: true,
        message: isInPast
          ? `Timestamp is in the past (${minutesDiff} minutes ago)`
          : `Timestamp is in the future (in ${minutesDiff} minutes)`,
        data: {
          currentTimestamp,
          currentDate: new Date(currentTimestamp).toISOString(),
          providedTimestamp: args.timestamp,
          providedDate: new Date(args.timestamp).toISOString(),
          difference: timeDiffMs,
          minutesDifference: minutesDiff,
        },
        timestamp: Date.now(),
      };
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Compare timestamps failed:", error);
      ctx.emit("compareTimestampsError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getContractName",
    description: "Finds the contract name for a given contract address",
    instructions:
      "Use this action when you need to identify what a contract address represents in the system",
    schema: z.object({
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]+$/)
        .describe("The contract address to look up"),
    }),
    handler(args, _ctx, _agent) {
      // Search through all categories in contracts.json
      const allContracts = contractAddresses as Record<string, Record<string, string>>;

      for (const category of Object.keys(allContracts)) {
        const contracts = allContracts[category];
        for (const [key, value] of Object.entries(contracts)) {
          if (value.toLowerCase() === args.address.toLowerCase()) {
            return {
              success: true,
              message: `Found contract: ${key} in category ${category}`,
              data: {
                name: key,
                category,
                address: value,
              },
              timestamp: Date.now(),
            };
          }
        }
      }

      return {
        success: false,
        message: `No contract found with address ${args.address}`,
        timestamp: Date.now(),
      };
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Contract name lookup failed:", error);
      ctx.emit("contractNameError", { action: ctx.call.name, error: error.message });
    },
  }),
];
