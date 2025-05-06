import { action } from "@daydreamsai/core";
import { z } from "zod";
import { executeQuery, getGameSessionId } from "../../utils/graphql";
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
import { getContractAddress } from "src/utils/contracts";

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
            message: "Cannot retrieve pair information: pair address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.pairAddress);
        const gameSessionId = await getGameSessionId();
        
        const result = await executeQuery(GET_PAIR_INFO, {
          address: normalizedAddress,
          gameSessionId: gameSessionId
        });
        
        if (!result || !result.pair) {
          return {
            success: false,
            message: `No pair information found for address ${args.pairAddress}. Please check context to get available pairs.`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: `Successfully retrieved information for pair at ${args.pairAddress}`,
          data: result,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get pair info:', error);
        return {
          success: false,
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
            message: "Cannot retrieve farm information: farm address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.farmAddress);
        const gameSessionId = await getGameSessionId();
        
        const result = await executeQuery(GET_FARM_INFO, {
          address: normalizedAddress,
          gameSessionId: gameSessionId
        });
        
        if (!result || !result.farm) {
          return {
            success: false,
            message: `No farm information found for address ${args.farmAddress}. Check the available farms in the Context`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: `Successfully retrieved information for farm at ${args.farmAddress}`,
          data: result,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get farm info:', error);
        return {
          success: false,
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
        const gameSessionId = await getGameSessionId();
        
        const result = await executeQuery(GET_ALL_FARMS, {
          gameSessionId: gameSessionId
        });
        
        if (!result || !result.farm || !Array.isArray(result.farm)) {
          return {
            success: false,
            message: "Failed to retrieve farms list: no farms data returned from query",
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: `Successfully retrieved information for ${result.farm.length} farms`,
          data: result,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get all farms:', error);
        return {
          success: false,
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
            message: "Cannot retrieve liquidity positions: agent address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.userAddress);
        const gameSessionId = await getGameSessionId();
        
        const result = await executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
          agentAddress: normalizedAddress,
          gameSessionId: gameSessionId
        });
        
        if (!result || !result.liquidityPosition || !Array.isArray(result.liquidityPosition)) {
          return {
            success: true,
            message: `No liquidity positions found for user ${args.userAddress}`,
            data: { liquidityPosition: [] },
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: `Successfully retrieved ${result.liquidityPosition.length} liquidity positions for user ${args.userAddress}`,
          data: result,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get user liquidity positions:', error);
        return {
          success: false,
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
            message: "Cannot retrieve stake positions: agent address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.userAddress);
        const gameSessionId = await getGameSessionId();
        
        const result = await executeQuery(GET_AGENT_STAKE_POSITIONS, {
          agentAddress: normalizedAddress,
          gameSessionId: gameSessionId
        });
        
        if (!result || !result.agentStake || !Array.isArray(result.agentStake)) {
          return {
            success: true,
            message: `No stake positions found for user ${args.userAddress}`,
            data: { agentStake: [] },
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: `Successfully retrieved ${result.agentStake.length} stake positions for user ${args.userAddress}`,
          data: result,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get agent stake positions:', error);
        return {
          success: false,
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
            message: "Cannot retrieve farm index: LP token address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(args.lpTokenAddress);
        const gameSessionId = await getGameSessionId();
        
        const result = await executeQuery(GET_FARM_INDEX_BY_LP_TOKEN, {
          lpTokenAddress: normalizedAddress,
          gameSessionId: gameSessionId
        });
        
        const farmIndex = result?.farm?.[0]?.farmIndex ?? null;
        
        if (farmIndex === null) {
          return {
            success: false,
            message: `No farm found for LP token address ${args.lpTokenAddress}. Please check context to get available LP tokens.`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: `LP token ${args.lpTokenAddress} corresponds to farm index ${farmIndex}`,
          data: {
            lpTokenAddress: args.lpTokenAddress,
            farmIndex
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get farm index by LP token:', error);
        return {
          success: false,
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
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const sessionAddress = getContractAddress('gameSession', 'current');
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot retrieve game session status: address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(sessionAddress);
        
        const result = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizedAddress
        });
        
        if (!result || !result.gameSession) {
          return {
            success: false,
            message: `No game session found for address ${sessionAddress}.`,
            timestamp: Date.now()
          };
        }
        
        const isActive = !result.gameSession.gameSuspended && !result.gameSession.gameOver;
        
        return {
          success: true,
          message: isActive 
            ? `Game session at ${sessionAddress} is active` 
            : `Game session at ${sessionAddress} is not active (${result.gameSession.gameSuspended ? 'suspended' : 'over'})`,
          data: {
            ...result.gameSession,
            isActive
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get game session status:', error);
        return {
          success: false,
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
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const sessionAddress = getContractAddress('gameSession', 'current');
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot retrieve game session index: address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(sessionAddress);
        
        const result = await executeQuery(GET_GAME_SESSION_INDEX_BY_ADDRESS, {
          address: normalizedAddress
        });
        
        if (!result?.gameSession || !result.gameSession.gameSessionIndex) {
          return {
            success: false,
            message: `No game session index found for address ${sessionAddress}.`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: `Game session at ${sessionAddress} has index ${result.gameSession.gameSessionIndex}`,
          data: {
            sessionAddress: sessionAddress,
            sessionIndex: result.gameSession.gameSessionIndex
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get game session index:', error);
        return {
          success: false,
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
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const sessionAddress = getContractAddress('gameSession', 'current');
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot retrieve most staked agents: session address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(sessionAddress);
        
        const result = await executeQuery(GET_MOST_STAKED_AGENTS, {
          sessionAddress: normalizedAddress,
          limit: 5
        });
        
        if (!result || !result.userStake || !Array.isArray(result.userStake)) {
          return {
            success: false,
            message: "Failed to retrieve most staked agents: no data returned from query",
            timestamp: Date.now()
          };
        }
        
        // Get current agent address for comparison
        const agentId =  getCurrentAgentId();
        
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
          message: `Successfully retrieved ${topAgents.length} most staked agents${
            currentAgentInList ? `. Your agent ranks #${currentAgentInList.rank}` : ''
          }`,
          data: {
            topAgents,
            currentAgentRank: currentAgentInList ? currentAgentInList.rank : null
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get most staked agents:', error);
        return {
          success: false,
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