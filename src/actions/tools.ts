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
    name: "getDeFiSpaceContext",
    description: "Retrieves the complete context and configuration for the defi.space ecosystem. Returns comprehensive information including game mechanics, winning conditions, all relevant smart contract addresses (AMM, reactors, tokens), account details, and protocol parameters. Essential for understanding the protocol's rules and available interactions. Example: getDeFiSpaceContext()",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"), 
    }),
    handler(call, ctx, agent) {
      return {
        success: true,
        data: DS_CONTEXT,
        message: "Successfully retrieved complete defi.space context and configuration",
        timestamp: Date.now(),
      };
    },
  }),
  
  action({
    name: "convertUint256ToDecimal",
    description: "Converts a Starknet uint256 number representation (consisting of low and high parts) into standard decimal and hexadecimal formats. Handles the full range of uint256 values. Returns both decimal string and hexadecimal representations. Example: convertUint256ToDecimal({ low: '1000', high: '0' })",
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
  }),
  
  action({
    name: "queryUserLiquidityPositions",
    description: "Queries the blockchain indexer to retrieve all liquidity positions for a specific user address. Returns detailed information about each position including pool addresses, token amounts, and LP token balances. Example: queryUserLiquidityPositions({ address: '0x123...' })",
    schema: z.object({
      address: z.string().describe("The user's Starknet address (in hex format)")
    }),
    async handler(call, ctx, agent) {
      try {
        // Normalize the address to ensure it's in the correct format
        const normalizedAddress = normalizeAddress(call.data.address);
        
        const result = await executeQuery(GET_USER_LIQUIDITY_POSITIONS, {
          user: normalizedAddress
        });
        
        if (!result || !result.liquidityPositions) {
          return {
            success: true,
            data: {
              positions: [],
              count: 0
            },
            message: `No liquidity positions found for address ${normalizedAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            positions: result.liquidityPositions,
            count: result.liquidityPositions.length
          },
          message: `Found ${result.liquidityPositions.length} liquidity positions for address ${normalizedAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          message: `Failed to query liquidity positions: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
  }),
  
  action({
    name: "queryUserStakePositions",
    description: "Queries the blockchain indexer to retrieve all staking positions for a specific user address. Returns detailed information about each position including reactor addresses, token amounts, and reward data. Example: queryUserStakePositions({ address: '0x123...' })",
    schema: z.object({
      address: z.string().describe("The user's Starknet address (in hex format)")
    }),
    async handler(call, ctx, agent) {
      try {
        // Normalize the address to ensure it's in the correct format
        const normalizedAddress = normalizeAddress(call.data.address);
        
        const result = await executeQuery(GET_USER_STAKE_POSITIONS, {
          user: normalizedAddress
        });
        
        if (!result || !result.stakePositions) {
          return {
            success: true,
            data: {
              positions: [],
              count: 0
            },
            message: `No stake positions found for address ${normalizedAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            positions: result.stakePositions,
            count: result.stakePositions.length
          },
          message: `Found ${result.stakePositions.length} stake positions for address ${normalizedAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
          message: `Failed to query stake positions: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
  }),
  
  action({
    name: "getAgentResourceBalances",
    description: "Retrieves all token balances for a specific agent or the current agent if no ID is provided. Returns detailed balance information including token addresses, symbols, and amounts in both raw and decimal formats. Example: getAgentResourceBalances({ agentId: 'agent1' })",
    schema: z.object({
      agentId: z.string().describe("The agent ID to query (optional, defaults to current agent)").optional()
    }),
    async handler(call, ctx, agent) {
      try {
        const agentId = call.data.agentId || getCurrentAgentId();
        
        if (!agentId) {
          return {
            success: false,
            error: "Could not determine agent ID",
            message: "Failed to get resource balances: could not determine agent ID",
            timestamp: Date.now()
          };
        }
        
        const balances = await getAgentResourceBalances(agentId);
        
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
  }),
  
  action({
    name: "compareAgentPositions",
    description: "Compares the positions (liquidity and staking) between two agents to identify differences in strategy. Returns a detailed comparison including unique positions for each agent and common positions with different amounts. Example: compareAgentPositions({ agentId1: 'agent1', agentId2: 'agent2' })",
    schema: z.object({
      agentId1: z.string().describe("First agent ID to compare"),
      agentId2: z.string().describe("Second agent ID to compare")
    }),
    async handler(call, ctx, agent) {
      try {
        const { agentId1, agentId2 } = call.data;
        
        if (agentId1 === agentId2) {
          return {
            success: false,
            error: "Agent IDs must be different",
            message: "Cannot compare: both agent IDs are the same",
            timestamp: Date.now()
          };
        }
        
        const comparison = await compareAgentPositions(agentId1, agentId2);
        
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
  }),
  
  action({
    name: "rankAgentsByHe3",
    description: "Retrieves a ranked list of all agents based on their He3 token balance. Returns agents sorted from highest to lowest balance with detailed information about each agent. Example: rankAgentsByHe3()",
    schema: z.object({}),
    async handler(call, ctx, agent) {
      try {
        const rankedAgents = await rankAgentsByHe3();
        
        // Store the ranking in context for reference
        if (ctx.agentMemory) {
          ctx.agentMemory.lastAgentRanking = {
            timestamp: new Date().toISOString(),
            ranking: rankedAgents
          };
        }
        
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
  }),
]; 