import { action } from "@daydreamsai/core";
import { z } from "zod";
import { uint256 } from "starknet";
import { DS_CONTEXT } from '../contexts/ds-context';
import { getCurrentAgentId } from "../utils/starknet";
import { 
  getAgentResourceBalances, 
  compareAgentPositions, 
  rankAgentsByHe3 
} from "../utils/competition";
import { getContractAddress } from "src/utils/contracts";

export const toolActions = [
  action({
    name: "getDefiSpaceContext",
    description: "Retrieves configuration data for the defi.space ecosystem",
    instructions: "Use this action when an agent needs to understand the game rules, contract addresses, and protocol parameters",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"), 
    }),
    handler(args, ctx, agent) {
      return {
        success: true,
        data: DS_CONTEXT,
        message: "Successfully retrieved complete defi.space context and configuration",
        timestamp: Date.now(),
      };
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Context retrieval failed:`, error);
      ctx.emit("contextRetrievalError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "convertUint256ToDecimal",
    description: "Converts a Starknet uint256 value to standard number formats",
    instructions: "Use this action when an agent needs to convert blockchain uint256 values to readable decimal numbers",
    schema: z.object({
      low: z.string().describe("Lower 128 bits of the uint256 number as a string"),
      high: z.string().describe("Upper 128 bits of the uint256 number as a string")
    }),
    async handler(args, ctx, agent) {
      try {
        const { low, high } = args;
        
        // Create a Uint256 object from the low and high parts
        const u256Value = uint256.uint256ToBN({
          low,
          high
        });
        
        return {
          success: true,
          data: {
            decimal: u256Value.toString(10),
            hex: "0x" + u256Value.toString(16)
          },
          message: `Converted uint256(${high}, ${low}) to decimal: ${u256Value.toString(10)}`,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          message: `Failed to convert uint256: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Uint256 conversion failed:`, error);
      ctx.emit("conversionError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getAgentResourceBalances",
    description: "Retrieves all token balances for a specified agent",
    instructions: "Use this action when an agent needs to check their token balances or monitor another agent's resources",
    schema: z.object({
      agentId: z.string().describe("Agent ID to query (defaults to current agent if not provided)").optional()
    }),
    async handler(args, ctx, agent) {
      try {
        const agentId = args.agentId || getCurrentAgentId();
        
        if (!agentId) {
          return {
            success: false,
            error: "Could not determine agent ID",
            message: "Failed to get resource balances: could not determine agent ID",
            timestamp: Date.now()
          };
        }

        const agentAddress = getContractAddress('agents', agentId);

        const balances = await getAgentResourceBalances(agentAddress);
        
        if (!balances || Object.keys(balances).length === 0) {
          return {
            success: true,
            data: {
              agentId,
              balances: {},
              count: 0
            },
            message: `No token balances found for agent ${agentId}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            agentId,
            balances,
            count: Object.keys(balances).length
          },
          message: `Found balances for ${Object.keys(balances).length} tokens for agent ${agentId}`,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          message: `Failed to get agent resource balances: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Resource balances query failed:`, error);
      ctx.emit("balancesQueryError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "compareAgentPositions",
    description: "Compares the strategies and positions between two agents",
    instructions: "Use this action when an agent needs to analyze differences in strategy with another agent to learn or develop counter-strategies",
    schema: z.object({
      agentId1: z.string().describe("First agent ID to include in the comparison"),
      agentId2: z.string().describe("Second agent ID to include in the comparison")
    }),
    async handler(args, ctx, agent) {
      try {
        const { agentId1, agentId2 } = args;
        
        if (agentId1 === agentId2) {
          return {
            success: false,
            error: "Agent IDs must be different",
            message: "Cannot compare: both agent IDs are the same",
            timestamp: Date.now()
          };
        }
        const agentAddress1 = getContractAddress('agents', agentId1);
        const agentAddress2 = getContractAddress('agents', agentId2);

        const comparison = await compareAgentPositions(agentAddress1, agentAddress2);
        
        return {
          success: true,
          data: comparison,
          message: `Successfully compared positions between agents ${agentId1} and ${agentId2}`,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          message: `Failed to compare agent positions: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Position comparison failed:`, error);
      ctx.emit("positionComparisonError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "rankAgentsByHe3",
    description: "Retrieves a ranked list of all agents based on He3 token balance",
    instructions: "Use this action when an agent needs to understand the competitive landscape and identify leading agents",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"), 
    }),
    async handler(args, ctx, agent) {
      try {
        const rankedAgents = await rankAgentsByHe3();
        
        return {
          success: true,
          data: {
            rankedAgents,
            count: rankedAgents.length,
            timestamp: new Date().toISOString()
          },
          message: `Successfully ranked ${rankedAgents.length} agents by He3 balance`,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          message: `Failed to rank agents by He3: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Agent ranking failed:`, error);
      ctx.emit("agentRankingError", { action: ctx.call.name, error: error.message });
    }
  }),
]; 