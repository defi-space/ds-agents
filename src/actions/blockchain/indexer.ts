import { action } from "@daydreamsai/core";
import { z } from "zod";
import { executeQuery } from "../../utils/graphql";
import { normalizeAddress } from "../../utils/starknet";
import {
  GET_POOL_INFO,
  GET_REACTOR_INFO,
  GET_ALL_REACTORS,
  GET_USER_LIQUIDITY_POSITIONS,
  GET_USER_STAKE_POSITIONS,
  GET_REACTOR_INDEX_BY_LP_TOKEN,
} from "../../utils/queries";

export const indexerActions = [
  action({
    name: "getPoolInfo",
    description: "Retrieves comprehensive information about a specific liquidity pool from the blockchain indexer. Returns detailed data including total liquidity, volume, fees, token reserves, APR/APY metrics, and recent trading activity. The pool data is indexed and aggregated for efficient querying, providing real-time insights into pool performance and market dynamics.",
    schema: z.object({
      poolAddress: z.string().describe("The Starknet address of the liquidity pool to query information for")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_POOL_INFO, {
          address: normalizeAddress(call.data.poolAddress)
        });
        return {
          success: true,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get pool info:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get pool info",
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getReactorInfo",
    description: "Fetches detailed information about a specific nuclear reactor from the blockchain indexer. Returns comprehensive data including reactor type, operational status, power output, efficiency metrics, maintenance schedule, carbon emissions data, and connected grid parameters. Provides essential monitoring data for reactor performance and compliance tracking.",
    schema: z.object({
      reactorAddress: z.string().describe("The Starknet address of the nuclear reactor smart contract to query")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_REACTOR_INFO, {
          address: normalizeAddress(call.data.reactorAddress)
        });
        return {
          success: true,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get reactor info:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get reactor info",
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getAllReactors",
    description: "Retrieves a comprehensive list of all registered nuclear reactors in the network with their current operational data. Returns an array of reactor information including locations, types, operational status, aggregate power output, efficiency metrics, and grid connection status. Essential for network-wide monitoring and capacity planning.",
    schema: z.object({
      message: z.string().describe("Ignore this field, it is not needed").default("None"), // Useless but needed for the schema
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_ALL_REACTORS, {});
        return {
          success: true,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get all reactors:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get all reactors",
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getUserLiquidityPositions",
    description: "Fetches all active liquidity positions for a specific user across all pools from the blockchain indexer. Returns detailed information including pool shares, token amounts, current value, accumulated fees, rewards, and historical position performance. Essential for tracking user's liquidity provision activities and returns.",
    schema: z.object({
      userAddress: z.string().describe("The Starknet address of the user whose liquidity positions are being queried")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_USER_LIQUIDITY_POSITIONS, {
          userAddress: normalizeAddress(call.data.userAddress)
        });
        return {
          success: true,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get user liquidity positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get user liquidity positions",
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getUserStakePositions",
    description: "Retrieves all active staking positions for a specific user from the blockchain indexer. Returns comprehensive data including staked amounts, earned rewards, lock periods, APR/APY rates, and historical staking performance. Provides complete visibility into user's staking activities and earnings across different staking programs.",
    schema: z.object({
      userAddress: z.string().describe("The Starknet address of the user whose staking positions are being queried")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_USER_STAKE_POSITIONS, {
          userAddress: normalizeAddress(call.data.userAddress)
        });
        return {
          success: true,
          data,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get user stake positions:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get user stake positions",
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getReactorIndexByLpToken",
    description: "Retrieves the reactor index for a given LP token address. This is a simple lookup that maps LP tokens to their corresponding reactor index in the system.",
    schema: z.object({
      lpTokenAddress: z.string().describe("The Starknet address of the LP token to find the corresponding reactor index for")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const data = await executeQuery(GET_REACTOR_INDEX_BY_LP_TOKEN, {
          lpTokenAddress: normalizeAddress(call.data.lpTokenAddress)
        });
        return {
          success: true,
          data: data?.reactor?.[0]?.reactorIndex ?? null,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get reactor index by LP token:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get reactor index by LP token",
          timestamp: Date.now(),
        };
      }
    },
  }),
]; 