import { action } from "@daydreamsai/core";
import { z } from "zod";
import { executeQuery } from "../../utils/graphql";
import { normalizeAddress, getAgentAddress } from "../../utils/starknet";
import {
  GET_POOL_INFO,
  GET_REACTOR_INFO,
  GET_ALL_REACTORS,
  GET_USER_LIQUIDITY_POSITIONS,
  GET_USER_STAKE_POSITIONS,
  GET_REACTOR_INDEX_BY_LP_TOKEN,
  GET_GAME_SESSION_STATUS,
  GET_GAME_SESSION_INDEX_BY_ADDRESS,
  GET_MOST_STAKED_AGENTS
} from "../../utils/queries";

export const indexerActions = [
  action({
    name: "getPoolInfo",
    description: "Retrieves comprehensive information about a specific liquidity pool from the blockchain indexer. Returns detailed data including total liquidity, volume, fees, token reserves, APR/APY metrics, and recent trading activity. Example: getPoolInfo({ poolAddress: '0x123abc...' })",
    schema: z.object({
      poolAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the liquidity pool to query information for (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.poolAddress) {
          return {
            success: false,
            error: "Pool address is required",
            message: "Cannot retrieve pool information: pool address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(call.data.poolAddress);
        
        const result = await executeQuery(GET_POOL_INFO, {
          address: normalizedAddress
        });
        
        if (!result || !result.pool) {
          return {
            success: false,
            error: "Pool not found",
            message: `No pool information found for address ${call.data.poolAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for pool at ${call.data.poolAddress}`,
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
  }),

  action({
    name: "getReactorInfo",
    description: "Fetches detailed information about a specific nuclear reactor from the blockchain indexer. Returns comprehensive data including reactor type, operational status, power output, and efficiency metrics. Example: getReactorInfo({ reactorAddress: '0x456def...' })",
    schema: z.object({
      reactorAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the nuclear reactor smart contract to query (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorAddress) {
          return {
            success: false,
            error: "Reactor address is required",
            message: "Cannot retrieve reactor information: reactor address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(call.data.reactorAddress);
        
        const result = await executeQuery(GET_REACTOR_INFO, {
          address: normalizedAddress
        });
        
        if (!result || !result.reactor) {
          return {
            success: false,
            error: "Reactor not found",
            message: `No reactor information found for address ${call.data.reactorAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved information for reactor at ${call.data.reactorAddress}`,
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
  }),

  action({
    name: "getAllReactors",
    description: "Retrieves a comprehensive list of all registered nuclear reactors in the network with their current operational data. Returns an array of reactor information including types, operational status, and efficiency metrics. Example: getAllReactors()",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const result = await executeQuery(GET_ALL_REACTORS, {});
        
        if (!result || !result.reactors || !Array.isArray(result.reactors)) {
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
  }),

  action({
    name: "getUserLiquidityPositions",
    description: "Fetches all active liquidity positions for a specific user across all pools from the blockchain indexer. Returns detailed information including pool shares, token amounts, and current value. Example: getUserLiquidityPositions({ userAddress: '0x789ghi...' })",
    schema: z.object({
      userAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the user whose liquidity positions are being queried (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.userAddress) {
          return {
            success: false,
            error: "User address is required",
            message: "Cannot retrieve liquidity positions: user address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(call.data.userAddress);
        
        const result = await executeQuery(GET_USER_LIQUIDITY_POSITIONS, {
          userAddress: normalizedAddress
        });
        
        if (!result || !result.liquidityPositions || !Array.isArray(result.liquidityPositions)) {
          return {
            success: true,
            data: { liquidityPositions: [] },
            message: `No liquidity positions found for user ${call.data.userAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved ${result.liquidityPositions.length} liquidity positions for user ${call.data.userAddress}`,
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
  }),

  action({
    name: "getUserStakePositions",
    description: "Retrieves all active staking positions for a specific user from the blockchain indexer. Returns comprehensive data including staked amounts, earned rewards, and lock periods. Example: getUserStakePositions({ userAddress: '0xabc123...' })",
    schema: z.object({
      userAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the user whose staking positions are being queried (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.userAddress) {
          return {
            success: false,
            error: "User address is required",
            message: "Cannot retrieve stake positions: user address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(call.data.userAddress);
        
        const result = await executeQuery(GET_USER_STAKE_POSITIONS, {
          userAddress: normalizedAddress
        });
        
        if (!result || !result.stakePositions || !Array.isArray(result.stakePositions)) {
          return {
            success: true,
            data: { stakePositions: [] },
            message: `No stake positions found for user ${call.data.userAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: result,
          message: `Successfully retrieved ${result.stakePositions.length} stake positions for user ${call.data.userAddress}`,
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
  }),

  action({
    name: "getReactorIndexByLpToken",
    description: "Retrieves the reactor index for a given LP token address. This is a simple lookup that maps LP tokens to their corresponding reactor index in the system. Example: getReactorIndexByLpToken({ lpTokenAddress: '0xdef456...' })",
    schema: z.object({
      lpTokenAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the LP token to find the corresponding reactor index for (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.lpTokenAddress) {
          return {
            success: false,
            error: "LP token address is required",
            message: "Cannot retrieve reactor index: LP token address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(call.data.lpTokenAddress);
        
        const result = await executeQuery(GET_REACTOR_INDEX_BY_LP_TOKEN, {
          lpTokenAddress: normalizedAddress
        });
        
        const reactorIndex = result?.reactor?.[0]?.reactorIndex ?? null;
        
        if (reactorIndex === null) {
          return {
            success: false,
            error: "Reactor not found for LP token",
            message: `No reactor found for LP token address ${call.data.lpTokenAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            lpTokenAddress: call.data.lpTokenAddress,
            reactorIndex
          },
          message: `LP token ${call.data.lpTokenAddress} corresponds to reactor index ${reactorIndex}`,
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
  }),

  action({
    name: "getGameSessionStatus",
    description: "Checks if a game session is active by verifying that it's not suspended or already over. Returns essential game session status information. Example: getGameSessionStatus({ sessionAddress: '0x123abc...' })",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the game session to query information for (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.sessionAddress) {
          return {
            success: false,
            error: "Game session address is required",
            message: "Cannot retrieve game session status: address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(call.data.sessionAddress);
        
        const result = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizedAddress
        });
        
        if (!result || !result.gameSession) {
          return {
            success: false,
            error: "Game session not found",
            message: `No game session found for address ${call.data.sessionAddress}`,
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
            ? `Game session at ${call.data.sessionAddress} is active` 
            : `Game session at ${call.data.sessionAddress} is not active (${result.gameSession.is_suspended ? 'suspended' : 'over'})`,
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
  }),

  action({
    name: "getGameSessionIndexByAddress",
    description: "Retrieves the session index for a specific game session address. Example: getGameSessionIndexByAddress({ sessionAddress: '0x123abc...' })",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the game session to query index for (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.sessionAddress) {
          return {
            success: false,
            error: "Game session address is required",
            message: "Cannot retrieve game session index: address is missing",
            timestamp: Date.now()
          };
        }
        
        const normalizedAddress = normalizeAddress(call.data.sessionAddress);
        
        const result = await executeQuery(GET_GAME_SESSION_INDEX_BY_ADDRESS, {
          address: normalizedAddress
        });
        
        if (!result?.gameSession || !result.gameSession.session_index) {
          return {
            success: false,
            error: "Game session index not found",
            message: `No game session index found for address ${call.data.sessionAddress}`,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            sessionAddress: call.data.sessionAddress,
            sessionIndex: result.gameSession.session_index
          },
          message: `Game session at ${call.data.sessionAddress} has index ${result.gameSession.session_index}`,
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
  }),

  action({
    name: "getMostStakedAgents",
    description: "Retrieves the agents with the highest stakes in a game session, with a configurable limit. Example: getMostStakedAgents({ sessionAddress: '0x123abc...', limit: 10 })",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the game session to query for (in hex format)"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum number of agents to return. Defaults to 5")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.sessionAddress) {
          return {
            success: false,
            error: "Session address is required",
            message: "Cannot retrieve most staked agents: session address is missing",
            timestamp: Date.now()
          };
        }
        
        const sessionAddress = normalizeAddress(call.data.sessionAddress);
        const limit = call.data.limit || 5;
        
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
  }),
]; 