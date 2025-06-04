import { action, z } from "@daydreamsai/core";
import {
  convertToContractValue,
  convertU256ToDecimal,
  formatTokenBalance,
  getTokenBalance,
  getStarknetChain,
  toHex,
  executeMultiCall,
  getApproveCall,
  toUint256WithSpread,
} from "../../utils/starknet";
import { getCoreAddress, getAgentAddress, availableTokenSymbols } from "../../utils/contracts";
import { getFarmIndex } from "../../utils/graphql";

// Define type for pending rewards
interface PendingRewards {
  [tokenAddress: string]: string;
}

export const yieldActions = [
  action({
    name: "depositToFarm",
    description: "Deposits LP token into a farm to generate rewards",
    instructions: "Use this action when you want to deposit LP tokens into a farm",
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
      amount: z.string().describe("Amount of LP tokens to deposit, in a human readable format"),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        let farmIndex: string;

        // Single sided farm
        if (args.tokenA === "He3" && args.tokenB === "He3") {
          farmIndex = await getFarmIndex(args.tokenA);
        } else {
          // Other farms should have different tokens
          if (args.tokenA === args.tokenB) {
            return {
              success: false,
              message: "Cannot deposit: tokenA and tokenB cannot be the same",
              timestamp: Date.now(),
            };
          }
          farmIndex = await getFarmIndex(args.tokenA, args.tokenB);
        }

        // Format amount to base units
        const amount = convertToContractValue(args.amount, 18);

        // Get FarmRouter address
        const farmRouterAddress = getCoreAddress("farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message: "Cannot deposit: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        const starknetChain = getStarknetChain();

        // Get farm address
        const farmAddress = toHex(
          await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_farm_address",
            calldata: [...toUint256WithSpread(farmIndex)],
          })
        );

        // Get LP token address
        const lpToken = toHex(
          await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_lp_token",
            calldata: [...toUint256WithSpread(farmIndex)],
          })
        );

        // Get agent address
        const agentAddress = getAgentAddress();

        // Get balance of LP token
        const balance = await getTokenBalance(lpToken, agentAddress);
        if (BigInt(amount) > balance) {
          return {
            success: false,
            message: `Cannot deposit: insufficient balance for LP token. amount: ${args.amount}, balance: ${formatTokenBalance(balance)}`,
            timestamp: Date.now(),
          };
        }

        // Create approve args for LP token
        const approveCall = getApproveCall(lpToken, farmAddress, amount);

        // Create deposit args
        const depositCall = {
          contractAddress: farmRouterAddress,
          entrypoint: "deposit",
          calldata: [...toUint256WithSpread(farmIndex), ...toUint256WithSpread(amount)],
        };

        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, depositCall]);

        if (result.receipt?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to deposit ${args.amount} LP tokens to farm ${args.tokenA}/${args.tokenB}: ${result.error || "Transaction unsuccessful"}`,
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully deposited ${args.amount} LP tokens to farm ${args.tokenA}/${args.tokenB}`,
          txHash: result.transactionHash,
          data: {
            farm: `${args.tokenA}/${args.tokenB}`,
            amount: args.amount,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to deposit to farm:", error);
        return {
          success: false,
          message: `Failed to deposit to farm: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Farm deposit failed:", error);
      ctx.emit("farmDepositError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "withdrawFromFarm",
    description: "Withdraws LP tokens from a farm and get your LP tokens back",
    instructions:
      "Use this action when you want to withdraw an amount of your deposited LP tokens from a farm",
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
      amount: z.string().describe("Amount of LP tokens to withdraw, in a human readable format"),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        let farmIndex: string;

        // Single sided farm
        if (args.tokenA === "He3" && args.tokenB === "He3") {
          farmIndex = await getFarmIndex(args.tokenA);
        } else {
          // Other farms should have different tokens
          if (args.tokenA === args.tokenB) {
            return {
              success: false,
              message: "Cannot withdraw: tokenA and tokenB cannot be the same",
              timestamp: Date.now(),
            };
          }
          farmIndex = await getFarmIndex(args.tokenA, args.tokenB);
        }

        // Format amount to base units
        const amount = convertToContractValue(args.amount, 18);

        // Get contract address
        const farmRouterAddress = getCoreAddress("farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message: "Cannot withdraw: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        const starknetChain = getStarknetChain();

        const agentAddress = getAgentAddress();
        const rawBalance = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "balance_of",
          calldata: [...toUint256WithSpread(farmIndex), agentAddress],
        });

        const balance = convertU256ToDecimal(rawBalance[0], rawBalance[1]).toString();
        if (BigInt(args.amount) > BigInt(balance)) {
          return {
            success: false,
            message: `Cannot withdraw: insufficient balance for LP token. amount: ${args.amount}, balance: ${formatTokenBalance(BigInt(balance))}`,
            timestamp: Date.now(),
          };
        }

        // Execute withdrawal
        const result = await starknetChain.write({
          contractAddress: farmRouterAddress,
          entrypoint: "withdraw",
          calldata: [...toUint256WithSpread(farmIndex), ...toUint256WithSpread(amount)],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to withdraw ${args.amount} LP tokens from farm ${args.tokenA}/${args.tokenB}: Transaction unsuccessful`,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully withdrew ${args.amount} LP tokens from farm ${args.tokenA}/${args.tokenB}`,
          txHash: result.transactionHash,
          data: {
            farm: `${args.tokenA}/${args.tokenB}`,
            amount: args.amount,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to withdraw from farm:", error);
        return {
          success: false,
          message: `Failed to withdraw from farm: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Farm withdrawal failed:", error);
      ctx.emit("farmWithdrawalError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "exitFarm",
    description: "Withdraws all LP tokens and rewards from a farm",
    instructions:
      "Use this action when you want to completely exit a farm, withdrawing all LP tokens and harvesting all rewards",
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
        let farmIndex: string;

        // Single sided farm
        if (args.tokenA === "He3" && args.tokenB === "He3") {
          farmIndex = await getFarmIndex(args.tokenA);
        } else {
          // Other farms should have different tokens
          if (args.tokenA === args.tokenB) {
            return {
              success: false,
              message: "Cannot exit: tokenA and tokenB cannot be the same",
              timestamp: Date.now(),
            };
          }
          farmIndex = await getFarmIndex(args.tokenA, args.tokenB);
        }

        // Get FarmRouter address
        const farmRouterAddress = getCoreAddress("farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message: "Cannot exit farm: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        const starknetChain = getStarknetChain();

        // Get current staked amount for logging
        const agentAddress = getAgentAddress();
        let stakedAmount = "unknown";

        try {
          const balance = await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "balance_of",
            calldata: [...toUint256WithSpread(farmIndex), agentAddress],
          });
          stakedAmount = convertU256ToDecimal(balance[0], balance[1]).toString();
        } catch (e) {
          // Non-critical error, continue with exit
          console.warn("Could not fetch staked amount before exit:", e);
        }

        // Execute exit
        const result = await starknetChain.write({
          contractAddress: farmRouterAddress,
          entrypoint: "exit",
          calldata: [...toUint256WithSpread(farmIndex)],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to exit farm ${args.tokenA}/${args.tokenB}: Transaction unsuccessful`,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully exited farm ${args.tokenA}/${args.tokenB}, withdrew all LP tokens (approximately ${formatTokenBalance(BigInt(stakedAmount))})`,
          txHash: result.transactionHash,
          data: {
            farm: `${args.tokenA}/${args.tokenB}`,
            exitedAmount: formatTokenBalance(BigInt(stakedAmount)),
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to exit farm:", error);
        return {
          success: false,
          message: `Failed to exit farm: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Farm exit failed:", error);
      ctx.emit("farmExitError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "harvestRewards",
    description: "Harvests rewards from a farm",
    instructions:
      "Use this action when you want to collect earned rewards without withdrawing your deposited LP tokens",
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
        // Input validation
        let farmIndex: string;

        // Single sided farm
        if (args.tokenA === "He3" && args.tokenB === "He3") {
          farmIndex = await getFarmIndex(args.tokenA);
        } else {
          // Other farms should have different tokens
          if (args.tokenA === args.tokenB) {
            return {
              success: false,
              message: "Cannot harvest: tokenA and tokenB cannot be the same",
              timestamp: Date.now(),
            };
          }
          farmIndex = await getFarmIndex(args.tokenA, args.tokenB);
        }

        // Get contract address
        const farmRouterAddress = getCoreAddress("farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot harvest rewards: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        const starknetChain = getStarknetChain();

        // Fetch reward tokens for logging
        const agentAddress = getAgentAddress();
        let rewardTokens: string[] = [];
        const pendingRewards: PendingRewards = {};

        try {
          // Get reward tokens
          const rewardTokensResponse = await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_reward_tokens",
            calldata: [...toUint256WithSpread(farmIndex)],
          });

          rewardTokens = Array.isArray(rewardTokensResponse)
            ? rewardTokensResponse
            : [rewardTokensResponse];

          // Get pending amounts for each token
          for (const token of rewardTokens) {
            const earned = await starknetChain.read({
              contractAddress: farmRouterAddress,
              entrypoint: "earned",
              calldata: [...toUint256WithSpread(farmIndex), agentAddress, token],
            });

            pendingRewards[token] = convertU256ToDecimal(earned[0], earned[1]).toString();
          }
        } catch (e) {
          // Non-critical error, continue with harvest
          console.warn("Could not fetch pending rewards before harvest:", e);
        }

        // Execute harvest
        const result = await starknetChain.write({
          contractAddress: farmRouterAddress,
          entrypoint: "harvest",
          calldata: [...toUint256WithSpread(farmIndex)],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to harvest rewards from farm ${args.tokenA}/${args.tokenB}: Transaction unsuccessful`,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully harvested rewards from farm ${args.tokenA}/${args.tokenB}`,
          txHash: result.transactionHash,
          data: {
            farm: `${args.tokenA}/${args.tokenB}`,
            harvestedAmounts: formatTokenBalance(BigInt(pendingRewards[rewardTokens[0]])),
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to harvest rewards:", error);
        return {
          success: false,
          message: `Failed to harvest rewards: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Reward harvest failed:", error);
      ctx.emit("rewardHarvestError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "checkPendingRewards",
    description: "Checks the amount of pending rewards in a farm",
    instructions:
      "Use this action when you want to know how much of a specific reward token you've earned",
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
        // Input validation
        let farmIndex: string;

        // Single sided farm
        if (args.tokenA === "He3" && args.tokenB === "He3") {
          farmIndex = await getFarmIndex(args.tokenA);
        } else {
          // Other farms should have different tokens
          if (args.tokenA === args.tokenB) {
            return {
              success: false,
              message: "Cannot check pending rewards: tokenA and tokenB cannot be the same",
              timestamp: Date.now(),
            };
          }
          farmIndex = await getFarmIndex(args.tokenA, args.tokenB);
        }

        // Get contract address
        const farmRouterAddress = getCoreAddress("farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot check pending rewards: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get agent address
        const agentAddress = getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot check pending rewards: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }

        const starknetChain = getStarknetChain();

        // Get reward token address - get the first reward token
        const rewardTokens = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "get_reward_tokens",
          calldata: [...toUint256WithSpread(farmIndex)],
        });

        // Use the first reward token address
        const rewardTokenAddress = rewardTokens[0];

        // Get earned amount
        const earned = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "earned",
          calldata: [...toUint256WithSpread(farmIndex), agentAddress, rewardTokenAddress],
        });

        const earnedAmount = convertU256ToDecimal(earned[0], earned[1]);

        return {
          success: true,
          message: `You have ${formatTokenBalance(earnedAmount)} of reward pending in farm ${args.tokenA}/${args.tokenB}`,
          data: {
            farm: `${args.tokenA}/${args.tokenB}`,
            pendingRewards: formatTokenBalance(earnedAmount),
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to check farm rewards:", error);
        return {
          success: false,
          message: `Failed to check pending rewards: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Pending rewards check failed:", error);
      ctx.emit("pendingRewardsError", { action: ctx.call.name, error: error.message });
    },
  }),
];
