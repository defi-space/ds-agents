import { action } from "@daydreamsai/core";
import { z } from "zod";
import { executeQuery } from "../../utils/graphql";
import { normalizeAddress, getAgentAddress } from "../../utils/starknet";
import {
  GET_POOL_INFO,
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
    name: "getPoolInfo",
    description: "Retrieves detailed information about a specific liquidity pool",
    instructions: "Use this action when an agent needs comprehensive data about a liquidity pool including reserves, volume, and fees",
    schema: z.object({
      poolAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Pool contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.poolAddress) {
          return {
            success: false,
            error: "Pool address is required",
            message: "Cannot retrieve pool information: pool address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.poolAddress);
        
        const result = await executeQuery(GET_POOL_INFO, {
          address: normalizedAddress
        });
        
        if (!result || !result.pool) {
          return {
            success: false,
            error: "Pool not found",
            message: `No pool information found for address ${args.poolAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for pool at ${args.poolAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get pool info:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get pool info",
          message: `Failed to retrieve pool information: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Pool info query failed:`, error);
      ctx.emit("poolInfoError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getReactorInfo",
    description: "Fetches detailed information about a specific farming reactor",
    instructions: "Use this action when an agent needs data about a reactor including its rewards, staked amounts, and other metrics",
    schema: z.object({
      reactorAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Reactor contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorAddress) {
          return {
            success: false,
            error: "Reactor address is required",
            message: "Cannot retrieve reactor information: reactor address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.reactorAddress);
        
        const result = await executeQuery(GET_FARM_INFO, {
          address: normalizedAddress
        });
        
        if (!result || !result.reactor) {
          return {
            success: false,
            error: "Reactor not found",
            message: `No reactor information found for address ${args.reactorAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for reactor at ${args.reactorAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get reactor info:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get reactor info",
          message: `Failed to retrieve reactor information: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reactor info query failed:`, error);
      ctx.emit("reactorInfoError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getAllReactors",
    description: "Retrieves a list of all registered farming reactors in the network",
    instructions: "Use this action when an agent needs to discover all available reactors and their data",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const result = await executeQuery(GET_ALL_FARMS, {});
        
        if (!result || !result.farms || !Array.isArray(result.farms)) {
          return {
            success: false,
            error: "No reactors data returned",
            message: "Failed to retrieve reactors list: no reactors data returned from query",
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for ${result.reactors.length} reactors`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get all reactors:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get all reactors",
          message: `Failed to retrieve reactor list: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Get all reactors query failed:`, error);
      ctx.emit("getAllReactorsError", { action: ctx.call.name, error: error.message });
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
        
        if (!result || !result.liquidityPositions || !Array.isArray(result.liquidityPositions)) {
          return {
            success: true,
            data: { liquidityPositions: [] },
            message: `No liquidity positions found for user ${args.userAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved ${result.liquidityPositions.length} liquidity positions for user ${args.userAddress}`,
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
        
        if (!result || !result.stakePositions || !Array.isArray(result.stakePositions)) {
          return {
            success: true,
            data: { stakePositions: [] },
            message: `No stake positions found for user ${args.userAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved ${result.stakePositions.length} stake positions for user ${args.userAddress}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get user stake positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get user stake positions",
          message: `Failed to retrieve user stake positions: ${(error as Error).message || "Unknown error"}`,
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
    name: "getReactorIndexByLpToken",
    description: "Retrieves the reactor index for a given LP token address",
    instructions: "Use this action when an agent needs to find which reactor corresponds to a specific LP token",
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
            message: "Cannot retrieve reactor index: LP token address is missing",
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
        console.error('Failed to get reactor index by LP token:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get reactor index by LP token",
          message: `Failed to retrieve reactor index for LP token: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reactor index lookup failed:`, error);
      ctx.emit("reactorIndexLookupError", { action: ctx.call.name, error: error.message });
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
        
        const isActive = !result.gameSession.is_suspended && !result.gameSession.is_over;
        
        return {
          success: true,
          data: {
            ...result.gameSession,
            isActive
          },
          message: isActive 
            ? `Game session at ${args.sessionAddress} is active` 
            : `Game session at ${args.sessionAddress} is not active (${result.gameSession.is_suspended ? 'suspended' : 'over'})`,
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
        
        if (!result?.gameSession || !result.gameSession.session_index) {
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
            sessionIndex: result.gameSession.session_index
          },
          message: `Game session at ${args.sessionAddress} has index ${result.gameSession.session_index}`,
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
        
        if (!result || !result.userGameStake || !Array.isArray(result.userGameStake)) {
          return {
            success: false,
            error: "No agent data returned",
            message: "Failed to retrieve most staked agents: no data returned from query",
            timestamp: Date.now()
          };
        }
        
        // Get current agent address for comparison
        const agentAddress = await getAgentAddress();
        const normalizedAgentAddress = agentAddress ? normalizeAddress(agentAddress) : null;
        
        // Add rank and check if current agent is among top stakers
        const topAgents = result.userGameStake.map((stake: any, index: number) => ({
          ...stake,
          rank: index + 1,
          isCurrentAgent: normalizedAgentAddress ? 
            normalizeAddress(stake.user_address) === normalizedAgentAddress : false
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