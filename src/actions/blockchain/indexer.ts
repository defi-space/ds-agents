import { action } from "@daydreamsai/core";
import { z } from "zod";
import { executeQuery } from "../../utils/graphql";
import { normalizeAddress, getCurrentAgentId } from "../../utils/starknet";
import {
  GET_PAIR_INFO,
  GET_FARM_INFO,
  GET_ALL_FARMS,
  GET_AGENT_LIQUIDITY_POSITIONS,
  GET_AGENT_STAKE_POSITIONS,
  GET_FARM_INDEX_BY_LP_TOKEN,
  GET_GAME_SESSION_STATUS,
  GET_GAME_SESSION_INDEX_BY_ADDRESS,
  GET_MOST_STAKED_AGENTS
} from "../../utils/queries";

export const indexerActions = [
  action({
    name: "getPairInfo",
    description: "Retrieves detailed information about a specific liquidity pair",
    instructions: "Use this action when an agent needs comprehensive data about a liquidity pair including reserves, volume, and fees",
    schema: z.object({
      pairAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Pair contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.pairAddress) {
          return {
            success: false,
            error: "Pair address is required",
            message: "Cannot retrieve pair information: pair address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.pairAddress);
        
        const result = await executeQuery(GET_PAIR_INFO, {
          address: normalizedAddress
        });
        
        if (!result || !result.pair) {
          return {
            success: false,
            error: "Pair not found",
            message: `No pair information found for address ${args.pairAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for pair at ${args.pairAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get pair info:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get pair info",
          message: `Failed to retrieve pair information: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Pair info query failed:`, error);
      ctx.emit("pairInfoError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getFarmInfo",
    description: "Fetches detailed information about a specific farming farm",
    instructions: "Use this action when an agent needs data about a farm including its rewards, staked amounts, and other metrics",
    schema: z.object({
      farmAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Farm contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmAddress) {
          return {
            success: false,
            error: "Farm address is required",
            message: "Cannot retrieve farm information: farm address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.farmAddress);
        
        const result = await executeQuery(GET_FARM_INFO, {
          address: normalizedAddress
        });
        
        if (!result || !result.farm) {
          return {
            success: false,
            error: "Farm not found",
            message: `No farm information found for address ${args.farmAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for farm at ${args.farmAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get farm info:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get farm info",
          message: `Failed to retrieve farm information: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Farm info query failed:`, error);
      ctx.emit("farmInfoError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getAllfarms",
    description: "Retrieves a list of all registered farming farms in the network",
    instructions: "Use this action when an agent needs to discover all available farms and their data",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const result = await executeQuery(GET_ALL_FARMS, {});
        
        if (!result || !result.farm || !Array.isArray(result.farm)) {
          return {
            success: false,
            error: "No farms data returned",
            message: "Failed to retrieve farms list: no farms data returned from query",
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for ${result.farm.length} farms`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get all farms:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get all farms",
          message: `Failed to retrieve farm list: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Get all farms query failed:`, error);
      ctx.emit("getAllfarmsError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getAgentLiquidityPositions",
    description: "Fetches all active liquidity positions for a specific agent across all pools",
    instructions: "Use this action when an agent needs to view its own or another agent's liquidity positions and pool shares",
    schema: z.object({
      userAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Agent wallet address to query liquidity positions for (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.userAddress) {
          return {
            success: false,
            error: "Agent address is required",
            message: "Cannot retrieve liquidity positions: agent address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.userAddress);
        
        const result = await executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
          agentAddress: normalizedAddress
        });
        
        if (!result || !result.liquidityPosition || !Array.isArray(result.liquidityPosition)) {
          return {
            success: true,
            data: { liquidityPosition: [] },
            message: `No liquidity positions found for user ${args.userAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved ${result.liquidityPosition.length} liquidity positions for user ${args.userAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get user liquidity positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get user liquidity positions",
          message: `Failed to retrieve user liquidity positions: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Liquidity positions query failed:`, error);
      ctx.emit("liquidityPositionsError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getAgentStakePositions",
    description: "Retrieves all active staking positions for a specific agent",
    instructions: "Use this action when an agent needs to view its own or another agent's staked amounts and earned rewards",
    schema: z.object({
      userAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Agent wallet address to query staking positions for (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.userAddress) {
          return {
            success: false,
            error: "Agent address is required",
            message: "Cannot retrieve stake positions: agent address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.userAddress);
        
        const result = await executeQuery(GET_AGENT_STAKE_POSITIONS, {
          agentAddress: normalizedAddress
        });
        
        if (!result || !result.agentStake || !Array.isArray(result.agentStake)) {
          return {
            success: true,
            data: { agentStake: [] },
            message: `No stake positions found for user ${args.userAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved ${result.agentStake.length} stake positions for user ${args.userAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get agent stake positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get agent stake positions",
          message: `Failed to retrieve agent stake positions: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Stake positions query failed:`, error);
      ctx.emit("stakePositionsError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getFarmIndexByLpToken",
    description: "Retrieves the farm index for a given LP token address",
    instructions: "Use this action when an agent needs to find which farm corresponds to a specific LP token",
    schema: z.object({
      lpTokenAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("LP token contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.lpTokenAddress) {
          return {
            success: false,
            error: "LP token address is required",
            message: "Cannot retrieve farm index: LP token address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.lpTokenAddress);
        
        const result = await executeQuery(GET_FARM_INDEX_BY_LP_TOKEN, {
          lpTokenAddress: normalizedAddress
        });
        
        const farmIndex = result?.farm?.[0]?.farmIndex ?? null;
        
        if (farmIndex === null) {
          return {
            success: false,
            error: "Farm not found for LP token",
            message: `No farm found for LP token address ${args.lpTokenAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            lpTokenAddress: args.lpTokenAddress,
            farmIndex
          },
          message: `LP token ${args.lpTokenAddress} corresponds to farm index ${farmIndex}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get farm index by LP token:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get farm index by LP token",
          message: `Failed to retrieve farm index for LP token: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Farm index lookup failed:`, error);
      ctx.emit("farmIndexLookupError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getGameSessionStatus",
    description: "Checks if a game session is active, suspended, or already over",
    instructions: "Use this action when an agent needs to verify the current status of a game session before taking actions",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Game session contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.sessionAddress) {
          return {
            success: false,
            error: "Game session address is required",
            message: "Cannot retrieve game session status: address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.sessionAddress);
        
        const result = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizedAddress
        });
        
        if (!result || !result.gameSession) {
          return {
            success: false,
            error: "Game session not found",
            message: `No game session found for address ${args.sessionAddress}`,
            timestamp: Date.now()
          };
        }
        
        const isActive = !result.gameSession.gameSuspended && !result.gameSession.gameOver;
        
        return {
          success: true,
          data: {
            ...result.gameSession,
            isActive
          },
          message: isActive 
            ? `Game session at ${args.sessionAddress} is active` 
            : `Game session at ${args.sessionAddress} is not active (${result.gameSession.gameSuspended ? 'suspended' : 'over'})`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get game session status:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get game session status",
          message: `Failed to retrieve game session status: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Game session status query failed:`, error);
      ctx.emit("gameSessionStatusError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getGameSessionIndexByAddress",
    description: "Retrieves the session index for a specific game session address",
    instructions: "Use this action when an agent needs to find the numerical index of a game session from its contract address",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Game session contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.sessionAddress) {
          return {
            success: false,
            error: "Game session address is required",
            message: "Cannot retrieve game session index: address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.sessionAddress);
        
        const result = await executeQuery(GET_GAME_SESSION_INDEX_BY_ADDRESS, {
          address: normalizedAddress
        });
        
        if (!result?.gameSession || !result.gameSession.gameSessionIndex) {
          return {
            success: false,
            error: "Game session index not found",
            message: `No game session index found for address ${args.sessionAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            sessionAddress: args.sessionAddress,
            sessionIndex: result.gameSession.gameSessionIndex
          },
          message: `Game session at ${args.sessionAddress} has index ${result.gameSession.gameSessionIndex}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get game session index:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get game session index",
          message: `Failed to retrieve game session index: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Game session index lookup failed:`, error);
      ctx.emit("gameSessionIndexError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getMostStakedAgents",
    description: "Retrieves the agents with the highest stakes in a game session",
    instructions: "Use this action when an agent needs to identify the leading agents in a game session based on their stake amounts",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Game session contract address (must be a valid hex address starting with 0x)"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of agents to return (default: 5, max: 50)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.sessionAddress) {
          return {
            success: false,
            error: "Session address is required",
            message: "Cannot retrieve most staked agents: session address is missing",
            timestamp: Date.now()
          };
        }
        
        const sessionAddress = normalizeAddress(args.sessionAddress);
        const limit = args.limit || 5;
        
        const result = await executeQuery(GET_MOST_STAKED_AGENTS, {
          sessionAddress: sessionAddress,
          limit: limit
        });
        
        if (!result || !result.userStake || !Array.isArray(result.userStake)) {
          return {
            success: false,
            error: "No agent data returned",
            message: "Failed to retrieve most staked agents: no data returned from query",
            timestamp: Date.now()
          };
        }
        
        // Get current agent address for comparison
        const agentId = await getCurrentAgentId();
        
        // Add rank and check if current agent is among top stakers
        const topAgents = result.userStake.map((stake: any, index: number) => ({
          ...stake,
          rank: index + 1,
          isCurrentAgent: agentId ? 
            stake.agentIndex === agentId : false
        }));
        
        const currentAgentInList = topAgents.find((agent: any) => agent.isCurrentAgent);
        
        return {
          success: true,
          data: {
            topAgents,
            currentAgentRank: currentAgentInList ? currentAgentInList.rank : null
          },
          message: `Successfully retrieved ${topAgents.length} most staked agents${
            currentAgentInList ? `. Your agent ranks #${currentAgentInList.rank}` : ''
          }`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get most staked agents:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get most staked agents",
          message: `Failed to retrieve most staked agents: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Get most staked agents query failed:`, error);
      ctx.emit("mostStakedAgentsError", { action: ctx.call.name, error: error.message });
    }
  }),
]; 