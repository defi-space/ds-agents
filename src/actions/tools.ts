import { action } from "@daydreamsai/core";
import { z } from "zod";
import { uint256 } from "starknet";
import { DS_CONTEXT } from '../contexts/ds-context';
import { getCategoryAddresses } from "../utils/contracts";
import { executeQuery } from "../utils/graphql";
import { normalizeAddress, getCurrentAgentId } from "../utils/starknet";
import { GET_USER_LIQUIDITY_POSITIONS, GET_USER_STAKE_POSITIONS } from "../utils/queries";
import { 
  getAgentResourceBalances, 
  compareAgentPositions, 
  rankAgentsByHe3 
} from "../utils/competition";

export const toolActions = [
  action({
    name: "Get defi.space context",
    description: "Retrieves the complete context and configuration for the defi.space ecosystem. Returns comprehensive information including game mechanics, winning conditions, all relevant smart contract addresses (AMM, reactors, tokens), account details, and protocol parameters. Essential for understanding the protocol's rules and available interactions. The context provides the foundation for all DeFi operations and strategic decision-making within the space.",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"), // Useless but needed for the schema
    }),
    handler(call, ctx, agent) {
      return {
        success: true,
        data: {
          result: DS_CONTEXT,
        },
        timestamp: Date.now(),
      };
    },
  }),
  action({
    name: "convertU256ToDecimal",
    description: "Converts a Starknet uint256 number representation (consisting of low and high parts) into standard decimal and hexadecimal formats. Handles the full range of uint256 values, essential for processing large numbers from Starknet smart contracts. Returns both decimal string and hexadecimal representations for maximum compatibility. Includes error handling for invalid inputs or overflow conditions.",
    schema: z.object({
      low: z.string().describe("The lower 128 bits of the uint256 number in string format"),
      high: z.string().describe("The upper 128 bits of the uint256 number in string format")
    }),
    async handler(call, ctx, agent) {
      try {
        const { low, high } = call.data;
        
        // Create a Uint256 object from the low and high parts
        const u256Value = uint256.uint256ToBN({
          low,
          high
        });
        
        return {
          success: true,
          result: {
            decimal: u256Value.toString(10),
            hex: u256Value.toString(16)
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message || "Failed to convert u256 to decimal",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "convertTimestamp",
    description: "Transforms Unix timestamps into multiple human-readable date formats. Provides ISO standard, locale-specific, and Unix formats for maximum compatibility. Automatically calculates a suggested deadline by adding one hour to the input timestamp. Handles both current and future timestamps, essential for setting transaction deadlines and scheduling operations. Returns comprehensive time information including original Unix timestamp for reference.",
    schema: z.object({
      timestamp: z.string().describe("Unix timestamp (in seconds) to be converted into various date formats")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const timestamp = BigInt(call.data.timestamp);
        const date = new Date(Number(timestamp) * 1000); // Convert to milliseconds
        
        return {
          success: true,
          result: {
            date: date.toISOString(),
            readable: date.toLocaleString(),
            unix: timestamp.toString(),
            // Add 1 hour to timestamp for deadline
            suggestedDeadline: (timestamp + 3600n).toString()
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to convert timestamp:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to convert timestamp",
          timestamp: Date.now(),
        };
      }
    }
  }),
  action({
    name: "getAllAgentAddresses",
    description: "Retrieves the addresses of all agents participating in the game. This allows an agent to be aware of other competing agents in the ecosystem.",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const agentAddresses = getCategoryAddresses('agents');
        return {
          success: true,
          data: agentAddresses,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get agent addresses:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get agent addresses",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "getAgentLiquidityPositions",
    description: "Retrieves the liquidity positions of a specific agent by their address. This allows monitoring of other agents' liquidity strategies and positions.",
    schema: z.object({
      agentAddress: z.string().describe("The Starknet address of the agent whose liquidity positions are being queried"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_USER_LIQUIDITY_POSITIONS, {
          userAddress: normalizeAddress(call.data.agentAddress)
        });
        return {
          success: true,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get agent liquidity positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get agent liquidity positions",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "getAgentStakePositions",
    description: "Retrieves the staking positions of a specific agent by their address. This allows monitoring of other agents' staking strategies and rewards.",
    schema: z.object({
      agentAddress: z.string().describe("The Starknet address of the agent whose staking positions are being queried"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_USER_STAKE_POSITIONS, {
          userAddress: normalizeAddress(call.data.agentAddress)
        });
        return {
          success: true,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get agent stake positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get agent stake positions",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "compareAgentPositions",
    description: "Compares the current agent's positions with another agent's positions to identify strategic differences and opportunities.",
    schema: z.object({
      targetAgentAddress: z.string().describe("The Starknet address of the agent to compare positions with"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Get current agent's address
        const agentAddresses = getCategoryAddresses('agents');
        const currentAgentId = getCurrentAgentId();
        const currentAgentAddress = agentAddresses[currentAgentId];
        
        if (!currentAgentAddress) {
          throw new Error(`Current agent address not found for ID: ${currentAgentId}`);
        }

        // Use the utility function to compare positions
        const comparisonData = await compareAgentPositions(currentAgentAddress, call.data.targetAgentAddress);

        return {
          success: true,
          data: comparisonData,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to compare agent positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to compare agent positions",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "getAgentResourceBalances",
    description: "Retrieves the resource balances of a specific agent by their address. This allows monitoring of other agents' resource accumulation progress.",
    schema: z.object({
      agentAddress: z.string().describe("The Starknet address of the agent whose resource balances are being queried"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Use the utility function to get resource balances
        const balances = await getAgentResourceBalances(call.data.agentAddress);
        
        return {
          success: true,
          data: {
            agentAddress: call.data.agentAddress,
            balances
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get agent resource balances:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get agent resource balances",
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "rankAgentsByHe3",
    description: "Ranks all agents by their He3 token balance to track competition progress and identify the leading agents.",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Use the utility function to rank agents
        const rankedAgents = await rankAgentsByHe3();
        
        return {
          success: true,
          data: {
            rankedAgents,
            timestamp: new Date().toISOString()
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to rank agents by He3:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to rank agents by He3",
          timestamp: Date.now(),
        };
      }
    },
  }),
]; 