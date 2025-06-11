import { action, z } from "@daydreamsai/core";
import { executeQuery, getGameSessionId, normalizeAddress } from "../../utils/graphql";
import {
  GET_PAIR_INFO,
  GET_FARM_INFO,
  GET_ALL_FARMS,
  GET_AGENT_LIQUIDITY_POSITIONS,
  GET_AGENT_FARM_POSITIONS,
  GET_GAME_SESSION_STATUS,
} from "../../utils/queries";
import {
  availableTokenSymbols,
  getCoreAddress,
  getFarmAddress,
  getPairAddress,
  availableAgentIds,
  getAgentAddress,
} from "../../utils/contracts";

export const indexerActions = [
  action({
    name: "getPairInfo",
    description: "Retrieves detailed information about a specific liquidity pair",
    instructions: "Use this action when you need comprehensive data about a liquidity pair",
    schema: z.object({
      tokenA: z
        .enum(availableTokenSymbols)
        .describe(
          `First token symbol for the pair. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
      tokenB: z
        .enum(availableTokenSymbols)
        .describe(
          `Second token symbol for the pair. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        // Input validation
        if (args.tokenA === args.tokenB) {
          return {
            success: false,
            message: "Cannot retrieve pair information: tokenA and tokenB cannot be the same",
            timestamp: Date.now(),
          };
        }

        const pairAddress = getPairAddress(args.tokenA, args.tokenB);
        const normalizedAddress = normalizeAddress(pairAddress);
        const gameSessionId = await getGameSessionId();

        const result = await executeQuery(GET_PAIR_INFO, {
          address: normalizedAddress,
          gameSessionId: gameSessionId,
        });

        if (!result || !result.pair) {
          return {
            success: false,
            message: `No pair information found for ${args.tokenA}/${args.tokenB}. Please check context to get available LP pairs.`,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully retrieved information for LP pair ${args.tokenA}/${args.tokenB}`,
          data: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get pair info:", error);
        return {
          success: false,
          message: `Failed to retrieve LP pair information: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Pair info query failed:", error);
      ctx.emit("pairInfoError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getFarmInfo",
    description: "Fetches detailed information about a specific farm and its rewards",
    instructions: "Use this action when an agent needs data about a farm",
    schema: z.object({
      tokenA: z
        .enum(availableTokenSymbols)
        .describe(
          `First token symbol for the farm. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
      tokenB: z
        .enum(availableTokenSymbols)
        .describe(
          `Second token symbol for the farm. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        let farmAddress: string;

        // Single sided farm
        if (args.tokenA === "He3" && args.tokenB === "He3") {
          farmAddress = getFarmAddress(args.tokenA);
        } else {
          // Other farms should have different tokens
          if (args.tokenA === args.tokenB) {
            return {
              success: false,
              message: "Cannot retrieve farm information: tokenA and tokenB cannot be the same",
              timestamp: Date.now(),
            };
          }
          farmAddress = getFarmAddress(args.tokenA, args.tokenB);
        }
        const normalizedAddress = normalizeAddress(farmAddress);
        const gameSessionId = await getGameSessionId();

        const result = await executeQuery(GET_FARM_INFO, {
          address: normalizedAddress,
          gameSessionId: gameSessionId,
        });

        if (!result || !result.farm) {
          return {
            success: false,
            message: `No farm information found for ${args.tokenA}/${args.tokenB}. Check the available farms in the context`,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully retrieved information for farm ${args.tokenA}/${args.tokenB}`,
          data: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get farm info:", error);
        return {
          success: false,
          message: `Failed to retrieve farm information: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Farm info query failed:", error);
      ctx.emit("farmInfoError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getAllFarms",
    description: "Retrieves a list of all farms available in the game",
    instructions: "Use this action when you need to discover all available farms",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (_args, _ctx, _agent) => {
      try {
        const gameSessionId = await getGameSessionId();

        const result = await executeQuery(GET_ALL_FARMS, {
          gameSessionId: gameSessionId,
        });

        if (!result || !result.farm || !Array.isArray(result.farm)) {
          return {
            success: false,
            message: "Failed to retrieve farms list: no farms data returned from query",
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully retrieved information for ${result.farm.length} farms`,
          data: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get all farms:", error);
        return {
          success: false,
          message: `Failed to retrieve farm list: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Get all farms query failed:", error);
      ctx.emit("getAllfarmsError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getAgentLiquidityPositions",
    description: "Fetches all active liquidity positions for a specific agent across all pools",
    instructions:
      "Use this action when you need to view your own or another agent's liquidity positions",
    schema: z.object({
      agentIndex: z.enum(availableAgentIds).describe("Agent ID to query liquidity positions for."),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        const agentAddress = getAgentAddress(args.agentIndex);
        if (!agentAddress) {
          return {
            success: false,
            message: `No agent address found for ${args.agentIndex}`,
            timestamp: Date.now(),
          };
        }
        const normalizedAddress = normalizeAddress(agentAddress);
        const gameSessionId = await getGameSessionId();

        const result = await executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
          agentAddress: normalizedAddress,
          gameSessionId: gameSessionId,
        });

        if (!result || !result.liquidityPosition || !Array.isArray(result.liquidityPosition)) {
          return {
            success: true,
            message: `No liquidity positions found for ${args.agentIndex}`,
            data: { liquidityPosition: [] },
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully retrieved ${result.liquidityPosition.length} liquidity positions for ${args.agentIndex}`,
          data: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get liquidity positions for agent:", error);
        return {
          success: false,
          message: `Failed to retrieve agent's liquidity positions: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Liquidity positions query failed:", error);
      ctx.emit("liquidityPositionsError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getAgentFarmPositions",
    description: "Retrieves all active farm positions for a specific agent",
    instructions:
      "Use this action when you need to view your own or another agent's farm positions",
    schema: z.object({
      agentIndex: z.enum(availableAgentIds).describe("Agent ID to query farm positions for."),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        const agentAddress = getAgentAddress(args.agentIndex);
        if (!agentAddress) {
          return {
            success: false,
            message: `No agent address found for ${args.agentIndex}`,
            timestamp: Date.now(),
          };
        }
        const normalizedAddress = normalizeAddress(agentAddress);
        const gameSessionId = await getGameSessionId();

        const result = await executeQuery(GET_AGENT_FARM_POSITIONS, {
          agentAddress: normalizedAddress,
          gameSessionId: gameSessionId,
        });

        if (!result || !result.agentStake || !Array.isArray(result.agentStake)) {
          return {
            success: true,
            message: `No farm positions found for ${args.agentIndex}`,
            data: { farmPositions: [] },
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully retrieved ${result.agentStake.length} farm positions for ${args.agentIndex}`,
          data: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get agent farm positions:", error);
        return {
          success: false,
          message: `Failed to retrieve agent farm positions: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Farm positions query failed:", error);
      ctx.emit("farmPositionsError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getGameSessionStatus",
    description: "Checks if a game session is active, suspended, or already over",
    instructions: "Use this action when you need to verify the current status of a game session",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (_args, _ctx, _agent) => {
      try {
        const sessionAddress = getCoreAddress("gameSession");
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot retrieve game session status: address is missing",
            timestamp: Date.now(),
          };
        }

        const normalizedAddress = normalizeAddress(sessionAddress);

        const result = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizedAddress,
        });

        if (!result || !result.gameSession) {
          return {
            success: false,
            message: `No game session found for address ${sessionAddress}.`,
            timestamp: Date.now(),
          };
        }

        // Handle the nested data structure correctly
        const gameSession = result.gameSession["0"] || result.gameSession;
        const isActive = !gameSession.gameSuspended && !gameSession.gameOver;
        const status = gameSession.gameOver
          ? "over"
          : gameSession.gameSuspended
            ? "suspended"
            : "active";

        return {
          success: true,
          message: `Game session is ${status}`,
          data: {
            ...gameSession,
            isActive,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get game session status:", error);
        return {
          success: false,
          message: `Failed to retrieve game session status: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Game session status query failed:", error);
      ctx.emit("gameSessionStatusError", { action: ctx.call.name, error: error.message });
    },
  }),
];
