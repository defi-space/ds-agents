import { action, z } from "@daydreamsai/core";
import { formatTokenBalance, normalizeAddress, getTokenBalance } from "../../utils/starknet";
import { executeQuery, getGameSessionId } from "../../utils/graphql";
import { GET_AGENT_LIQUIDITY_POSITIONS, GET_AGENT_FARM_POSITIONS } from "../../utils/queries";
import {
  getAgentAddress,
  availableTokenSymbols,
  getResourceAddress,
  getCoreAddress,
} from "../../utils/contracts";

export const utilsActions = [
  action({
    name: "getResourceBalance",
    description: "Retrieves the current balance of any resource token",
    instructions:
      "Use this action when you need to check your balance of a specific resource token",
    schema: z.object({
      token: z
        .enum(availableTokenSymbols)
        .describe(`Token symbol. Available tokens: ${availableTokenSymbols.join(", ")}`),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        const rawTokenAddress = getResourceAddress(args.token);
        if (!rawTokenAddress) {
          return {
            success: false,
            message: `Cannot retrieve resource balance: token ${args.token} not found`,
            timestamp: Date.now(),
          };
        }

        const tokenAddress = normalizeAddress(rawTokenAddress);
        const agentAddress = getAgentAddress();

        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot retrieve resource balance: failed to get agent address",
            timestamp: Date.now(),
          };
        }

        const balance = await getTokenBalance(tokenAddress, agentAddress);

        // Convert the decimal balance to proper token decimals
        const rawBalance = BigInt(balance.toString());
        const adjustedBalance = formatTokenBalance(rawBalance);

        return {
          success: true,
          message: `Current balance of token ${args.token}: ${adjustedBalance}`,
          data: {
            balance: adjustedBalance,
            tokenAddress: tokenAddress,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get resource balance:", error);
        return {
          success: false,
          message: `Failed to retrieve resource balance: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Resource balance query failed:`, error);
      ctx.emit("resourceBalanceError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getResourceState",
    description:
      "Retrieves all resource balances, liquidity positions, and farm positions with pending rewards",
    instructions:
      "Use this action when you need to see all your resource token balances, liquidity positions, and farm positions at once",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Get agent address
        const agentAddress = getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot retrieve resource state: failed to get agent address",
            timestamp: Date.now(),
          };
        }

        // Get game session ID for querying positions
        const sessionAddress = getCoreAddress("gameSession");
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot retrieve resource state: failed to get game session address",
            timestamp: Date.now(),
          };
        }

        const gameSessionId = await getGameSessionId();

        // Fetch all data concurrently
        const [
          // All resource token balances
          wD,
          C,
          Nd,
          Dy,
          Y,
          GRP,
          GPH,
          He3,
          // Agent's liquidity and farm positions
          liquidityPositions,
          farmPositions,
        ] = await Promise.all([
          // Resource balance queries
          getTokenBalance(getResourceAddress("wD"), agentAddress),
          getTokenBalance(getResourceAddress("C"), agentAddress),
          getTokenBalance(getResourceAddress("Nd"), agentAddress),
          getTokenBalance(getResourceAddress("Dy"), agentAddress),
          getTokenBalance(getResourceAddress("Y"), agentAddress),
          getTokenBalance(getResourceAddress("GRP"), agentAddress),
          getTokenBalance(getResourceAddress("GPH"), agentAddress),
          getTokenBalance(getResourceAddress("He3"), agentAddress),

          // Position queries
          executeQuery(GET_AGENT_LIQUIDITY_POSITIONS, {
            agentAddress: normalizeAddress(agentAddress),
            gameSessionId: gameSessionId,
          }),
          executeQuery(GET_AGENT_FARM_POSITIONS, {
            agentAddress: normalizeAddress(agentAddress),
            gameSessionId: gameSessionId,
          }),
        ]);

        // Format resource balances (getTokenBalance returns BigInt, need to format for display)
        const resourceBalances = {
          wD: formatTokenBalance(wD),
          C: formatTokenBalance(C),
          Nd: formatTokenBalance(Nd),
          Dy: formatTokenBalance(Dy),
          Y: formatTokenBalance(Y),
          GRP: formatTokenBalance(GRP),
          GPH: formatTokenBalance(GPH),
          He3: formatTokenBalance(He3),
        };

        // Process liquidity positions
        const formattedLiquidityPositions = liquidityPositions?.liquidityPosition
          ? liquidityPositions.liquidityPosition.map((pos: any) => ({
              pairAddress: pos.pairAddress,
              liquidity: pos.liquidity,
              depositsToken0: pos.depositsToken0,
              depositsToken1: pos.depositsToken1,
              withdrawalsToken0: pos.withdrawalsToken0,
              withdrawalsToken1: pos.withdrawalsToken1,
              pairInfo: pos.pair
                ? {
                    token0Address: pos.pair.token0Address,
                    token1Address: pos.pair.token1Address,
                    token0Name: pos.pair.token0Name,
                    token0Symbol: pos.pair.token0Symbol,
                    token1Name: pos.pair.token1Name,
                    token1Symbol: pos.pair.token1Symbol,
                    reserve0: pos.pair.reserve0,
                    reserve1: pos.pair.reserve1,
                    totalSupply: pos.pair.totalSupply,
                    gameSessionId: pos.pair.gameSessionId,
                  }
                : null,
            }))
          : [];

        // Process farm positions with pending rewards
        const formattedFarmPositions =
          farmPositions?.agentStake && Array.isArray(farmPositions.agentStake)
            ? farmPositions.agentStake.map((stake: any) => {
                // Extract pending rewards from rewardStates
                const rewardStates = stake.rewardStates || [];
                const pendingRewards = rewardStates.map((rewardState: any) => ({
                  farmAddress: stake.farmAddress,
                  rewardTokenAddress: rewardState.rewardTokenAddress,
                  pendingAmount: rewardState.lastPendingRewards, // This is the pending rewards amount
                  rewardPerTokenPaid: rewardState.rewardPerTokenPaid,
                  rewardToken: rewardState.reward
                    ? {
                        name: rewardState.reward.rewardTokenName,
                        symbol: rewardState.reward.rewardTokenSymbol,
                      }
                    : null,
                }));

                return {
                  farmAddress: stake.farmAddress,
                  stakedAmount: stake.stakedAmount,
                  pendingRewards: pendingRewards, // All pending rewards for this farm position
                };
              })
            : [];

        return {
          success: true,
          message: `Retrieved resource state: ${formattedLiquidityPositions.length} liquidity positions, ${formattedFarmPositions.length} farm positions`,
          data: {
            // All resource token balances
            resourceBalances,
            // Agent's liquidity positions
            liquidityPositions: formattedLiquidityPositions,
            // Agent's farm positions with pending rewards
            farmPositions: formattedFarmPositions,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to retrieve resource state: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Resource state query failed:`, error);
      ctx.emit("resourceStateError", { action: ctx.call.name, error: error.message });
    },
  }),
];
