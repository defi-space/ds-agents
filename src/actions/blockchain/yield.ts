import { action } from "@daydreamsai/core";
import { z } from "zod";
import { convertU256ToDecimal, getTokenBalance, starknetChain, toHex } from "../../utils/starknet";
import { toUint256WithSpread } from "../../utils/starknet";
import { executeMultiCall, getApproveCall } from "../../utils/starknet";
import { getContractAddress } from "src/utils/contracts";
import { getAgentAddress } from "../../utils/starknet";

// Define type for pending rewards
interface PendingRewards {
  [tokenAddress: string]: string;
}

export const yieldActions = [
  action({
    name: "depositToFarm",
    description: "Deposits paired LP tokens into a farm index/pool for yield farming and rewards",
    instructions:
      "Use this action when an agent wants to stake LP tokens in a farm index/pool to earn rewards",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
      amount: z
        .string()
        .describe(
          "Amount of LP tokens to deposit as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)"
        ),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex || !args.amount) {
          return {
            success: false,
            message: "Both farmIndex and amount are required for deposit",
            timestamp: Date.now(),
          };
        }

        // Get contract addresses
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message: "Cannot deposit: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get farm address
        const farmAddress = toHex(
          await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_farm_address",
            calldata: [...toUint256WithSpread(args.farmIndex)],
          })
        );

        // Get LP token address
        const lpToken = toHex(
          await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_lp_token",
            calldata: [...toUint256WithSpread(args.farmIndex)],
          })
        );

        const agentAddress = await getAgentAddress();
        const balance = await getTokenBalance(lpToken, agentAddress);
        if (BigInt(args.amount) > balance) {
          return {
            success: false,
            message: `Cannot deposit: insufficient balance for LP token. amount: ${args.amount}, balance: ${balance}`,
            timestamp: Date.now(),
          };
        }

        // Create approve args for LP token
        const approveCall = getApproveCall(lpToken, farmAddress, args.amount);

        // Create deposit args
        const depositCall = {
          contractAddress: farmRouterAddress,
          entrypoint: "deposit",
          calldata: [...toUint256WithSpread(args.farmIndex), ...toUint256WithSpread(args.amount)],
        };

        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, depositCall]);

        if (result.receipt?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to deposit ${args.amount} LP tokens to farm ${args.farmIndex}: ${result.error || "Transaction unsuccessful"}`,
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully deposited ${args.amount} LP tokens to farm ${args.farmIndex}`,
          txHash: result.transactionHash,
          data: {
            farmIndex: args.farmIndex,
            amount: args.amount,
            lpToken,
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
    onError: async (error, ctx, agent) => {
      console.error(`Farm deposit failed:`, error);
      ctx.emit("farmDepositError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "withdrawFromFarm",
    description: "Withdraws LP tokens from a farm",
    instructions:
      "Use this action when an agent wants to withdraw an amount of their staked LP tokens from a farm index/pool",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
      amount: z
        .string()
        .describe(
          "Amount of LP tokens to withdraw as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)"
        ),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex || !args.amount) {
          return {
            success: false,
            message: "Both farmIndex and amount are required for withdrawal",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message: "Cannot withdraw: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        const agentAddress = await getAgentAddress();
        const rawBalance = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "balance_of",
          calldata: [...toUint256WithSpread(args.farmIndex), agentAddress],
        });

        const balance = convertU256ToDecimal(rawBalance[0], rawBalance[1]).toString();
        if (BigInt(args.amount) > BigInt(balance)) {
          return {
            success: false,
            message: `Cannot withdraw: insufficient balance for LP token. amount: ${args.amount}, balance: ${balance}`,
            timestamp: Date.now(),
          };
        }

        // Execute withdrawal
        const result = await starknetChain.write({
          contractAddress: farmRouterAddress,
          entrypoint: "withdraw",
          calldata: [...toUint256WithSpread(args.farmIndex), ...toUint256WithSpread(args.amount)],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to withdraw ${args.amount} LP tokens from farm ${args.farmIndex}: Transaction unsuccessful`,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully withdrew ${args.amount} LP tokens from farm ${args.farmIndex}`,
          txHash: result.transactionHash,
          data: {
            farmIndex: args.farmIndex,
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
    onError: async (error, ctx, agent) => {
      console.error(`Farm withdrawal failed:`, error);
      ctx.emit("farmWithdrawalError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "exitFarm",
    description: "Withdraws all LP tokens and rewards from a farm",
    instructions:
      "Use this action when an agent wants to completely exit a farm, withdrawing all LP tokens and harvesting all rewards",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex) {
          return {
            success: false,
            message: "farmIndex is required for exiting a farm",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message: "Cannot exit farm: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get current staked amount for logging
        const agentAddress = await getAgentAddress();
        let stakedAmount: string = "unknown";

        try {
          const balance = await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "balance_of",
            calldata: [...toUint256WithSpread(args.farmIndex), agentAddress],
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
          calldata: [...toUint256WithSpread(args.farmIndex)],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to exit farm ${args.farmIndex}: Transaction unsuccessful`,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully exited farm ${args.farmIndex}, withdrew all LP tokens (approximately ${stakedAmount})`,
          txHash: result.transactionHash,
          data: {
            farmIndex: args.farmIndex,
            exitedAmount: stakedAmount,
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
    onError: async (error, ctx, agent) => {
      console.error(`Farm exit failed:`, error);
      ctx.emit("farmExitError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "harvestRewards",
    description: "Claims accumulated reward tokens from a farm index/pool",
    instructions:
      "Use this action when an agent wants to collect earned rewards without withdrawing their staked LP tokens",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex) {
          return {
            success: false,
            message: "farmIndex is required for harvesting rewards",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot harvest rewards: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Fetch reward tokens for logging
        const agentAddress = await getAgentAddress();
        let rewardTokens: string[] = [];
        let pendingRewards: PendingRewards = {};

        try {
          // Get reward tokens
          const rewardTokensResponse = await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_reward_tokens",
            calldata: [...toUint256WithSpread(args.farmIndex)],
          });

          rewardTokens = Array.isArray(rewardTokensResponse)
            ? rewardTokensResponse
            : [rewardTokensResponse];

          // Get pending amounts for each token
          for (const token of rewardTokens) {
            const earned = await starknetChain.read({
              contractAddress: farmRouterAddress,
              entrypoint: "earned",
              calldata: [...toUint256WithSpread(args.farmIndex), agentAddress, token],
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
          calldata: [...toUint256WithSpread(args.farmIndex)],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message: `Failed to harvest rewards from farm ${args.farmIndex}: Transaction unsuccessful`,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message: `Successfully harvested rewards from farm ${args.farmIndex}`,
          txHash: result.transactionHash,
          data: {
            farmIndex: args.farmIndex,
            rewardTokens,
            harvestedAmounts: pendingRewards,
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
    onError: async (error, ctx, agent) => {
      console.error(`Reward harvest failed:`, error);
      ctx.emit("rewardHarvestError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "checkPendingRewards",
    description: "Checks the amount of pending rewards for a specific token in a farm",
    instructions:
      "Use this action when an agent wants to know how much of a specific reward token they've earned",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
      rewardToken: z
        .string()
        .regex(/^0x[a-fA-F0-9]+$/)
        .describe("Reward token contract address (must be a valid hex address starting with 0x)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex || !args.rewardToken) {
          return {
            success: false,
            message: "Both farmIndex and rewardToken are required for checking pending rewards",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot check pending rewards: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get agent address
        const agentAddress = await getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot check pending rewards: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }

        // Get earned amount
        const earned = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "earned",
          calldata: [...toUint256WithSpread(args.farmIndex), agentAddress, args.rewardToken],
        });

        const earnedAmount = convertU256ToDecimal(earned[0], earned[1]).toString();

        return {
          success: true,
          message: `You have ${earnedAmount} of reward token ${args.rewardToken} pending in farm ${args.farmIndex}`,
          data: {
            farmIndex: args.farmIndex,
            rewardToken: args.rewardToken,
            earnedAmount,
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
    onError: async (error, ctx, agent) => {
      console.error(`Pending rewards check failed:`, error);
      ctx.emit("pendingRewardsError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getFarmLpToken",
    description: "Retrieves the LP token address accepted by a specific farm",
    instructions:
      "Use this action when an agent needs to know which LP token to approve before depositing to a farm",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex) {
          return {
            success: false,
            message: "farmIndex is required for getting LP token address",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message: "Cannot get LP token: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get LP token address
        const lpTokenResponse = toHex(
          await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_lp_token",
            calldata: [...toUint256WithSpread(args.farmIndex)],
          })
        );

        const lpToken = Array.isArray(lpTokenResponse) ? lpTokenResponse[0] : lpTokenResponse;

        return {
          success: true,
          message: `The LP token for farm ${args.farmIndex} is ${lpToken}`,
          data: {
            farmIndex: args.farmIndex,
            lpToken,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get LP token:", error);
        return {
          success: false,
          message: `Failed to get LP token: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`LP token lookup failed:`, error);
      ctx.emit("lpTokenLookupError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getAgentStakedAmount",
    description: "Retrieves the amount of LP tokens an agent has staked in a farm index/pool",
    instructions:
      "Use this action when an agent wants to check how many LP tokens they have staked in a specific farm",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex) {
          return {
            success: false,
            message: "farmIndex is required for getting staked amount",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot get staked amount: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get agent address
        const agentAddress = await getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot get staked amount: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }

        // Get balance
        const balance = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "balance_of",
          calldata: [...toUint256WithSpread(args.farmIndex), agentAddress],
        });

        const stakedAmount = convertU256ToDecimal(balance[0], balance[1]).toString();

        return {
          success: true,
          message: `You have ${stakedAmount} LP tokens staked in farm ${args.farmIndex}`,
          data: {
            farmIndex: args.farmIndex,
            stakedAmount,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get balance:", error);
        return {
          success: false,
          message: `Failed to get staked amount: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Staked amount query failed:`, error);
      ctx.emit("stakedAmountError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getFarmTotalDeposited",
    description: "Gets the total amount of LP tokens deposited in a farm",
    instructions:
      "Use this action when an agent needs to know the total amount of LP tokens staked by all agents in a farm",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex) {
          return {
            success: false,
            message: "farmIndex is required for getting total deposited amount",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot get total deposited: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get total deposited
        const totalDeposited = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "total_deposited",
          calldata: [...toUint256WithSpread(args.farmIndex)],
        });

        const totalDepositedAmount = convertU256ToDecimal(
          totalDeposited[0],
          totalDeposited[1]
        ).toString();

        return {
          success: true,
          message: `Total deposits in farm ${args.farmIndex} amount to ${totalDepositedAmount} LP tokens`,
          data: {
            farmIndex: args.farmIndex,
            totalDepositedAmount,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get total deposited:", error);
        return {
          success: false,
          message: `Failed to get total deposited amount: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Total deposits query failed:`, error);
      ctx.emit("totalDepositsError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getFarmAddress",
    description: "Retrieves the contract address of a specific farm",
    instructions:
      "Use this action when an agent needs to get the contract address of a farm for direct interaction",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex) {
          return {
            success: false,
            message: "farmIndex is required for getting farm address",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot get farm address: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get farm address
        const farmAddress = toHex(
          await starknetChain.read({
            contractAddress: farmRouterAddress,
            entrypoint: "get_farm_address",
            calldata: [...toUint256WithSpread(args.farmIndex)],
          })
        );

        const formattedAddress = Array.isArray(farmAddress) ? farmAddress[0] : farmAddress;

        return {
          success: true,
          message: `The address for farm ${args.farmIndex} is ${formattedAddress}`,
          data: {
            farmIndex: args.farmIndex,
            farmAddress: formattedAddress,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get farm address:", error);
        return {
          success: false,
          message: `Failed to get farm address: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Farm address lookup failed:`, error);
      ctx.emit("farmAddressError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getFarmRewardTokens",
    description: "Gets the list of reward tokens available from a specific farm",
    instructions:
      "Use this action when an agent needs to know which reward tokens they can earn from a farm",
    schema: z.object({
      farmIndex: z
        .string()
        .describe("Unique farm identifier in the FarmRouter contract (numeric index as string)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.farmIndex) {
          return {
            success: false,
            message: "farmIndex is required for getting reward tokens",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const farmRouterAddress = getContractAddress("core", "farmRouter");
        if (!farmRouterAddress) {
          return {
            success: false,
            message:
              "Cannot get reward tokens: FarmRouter contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get reward tokens
        const rewardTokens = await starknetChain.read({
          contractAddress: farmRouterAddress,
          entrypoint: "get_reward_tokens",
          calldata: [...toUint256WithSpread(args.farmIndex)],
        });

        const formattedTokens = Array.isArray(rewardTokens) ? rewardTokens : [rewardTokens];

        return {
          success: true,
          message: `Farm ${args.farmIndex} has ${formattedTokens.length} reward token(s)`,
          data: {
            farmIndex: args.farmIndex,
            rewardTokens: formattedTokens,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get reward tokens:", error);
        return {
          success: false,
          message: `Failed to get reward tokens: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reward tokens query failed:`, error);
      ctx.emit("rewardTokensError", { action: ctx.call.name, error: error.message });
    },
  }),
];
