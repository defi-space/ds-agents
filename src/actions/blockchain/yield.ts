import { action } from "@daydreamsai/core";
import { z } from "zod";
import { convertU256ToDecimal, starknetChain, toHex } from "../../utils/starknet";
import { toUint256WithSpread } from "../../utils/starknet";
import { executeMultiCall, getApproveCall } from '../../utils/starknet';
import { getContractAddress } from "src/utils/contracts";
import { getAgentAddress } from "../../utils/starknet";

// Define type for pending rewards
interface PendingRewards {
  [tokenAddress: string]: string;
}

export const yieldActions = [
  action({
    name: "depositToReactor",
    description: "Deposits LP tokens into a farming reactor for yield farming",
    instructions: "Use this action when an agent wants to stake LP tokens in a reactor to earn rewards",
    schema: z.object({
        reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)"),
        amount: z.string().describe("Amount of LP tokens to deposit as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex || !args.amount) {
          return {
            success: false,
            error: "Missing required fields",
            message: "Both reactorIndex and amount are required for deposit",
            timestamp: Date.now(),
          };
        }

        // Get contract addresses
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot deposit: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get reactor address
        const reactorAddress = toHex(await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_farm_address",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        }));
        
        // Get LP token address
        const lpToken = toHex(await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_lp_token",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        }));

        // Create approve args for LP token
        const approveCall = getApproveCall(
          lpToken,
          reactorAddress,
          args.amount
        );
        
        // Create deposit args
        const depositCall = {
          contractAddress: conduitAddress,
          entrypoint: "deposit",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex),
            ...toUint256WithSpread(args.amount)
          ]
        };
        
        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, depositCall]);
        
        if (result.receipt?.statusReceipt !== 'success') {
          return {
            success: false,
            error: result.error || 'Transaction failed',
            message: `Failed to deposit ${args.amount} LP tokens to reactor ${args.reactorIndex}: ${result.error || 'Transaction unsuccessful'}`,
            transactionHash: result.transactionHash,
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            amount: args.amount,
            lpToken,
            transactionHash: result.transactionHash,
            receipt: result.receipt
          },
          message: `Successfully deposited ${args.amount} LP tokens to reactor ${args.reactorIndex}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to deposit to reactor:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to deposit to reactor',
          message: `Failed to deposit to reactor: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reactor deposit failed:`, error);
      ctx.emit("reactorDepositError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "withdrawFromReactor",
    description: "Withdraws LP tokens from a farming reactor",
    instructions: "Use this action when an agent wants to withdraw some of their staked LP tokens from a reactor",
    schema: z.object({
      reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)"),
      amount: z.string().describe("Amount of LP tokens to withdraw as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex || !args.amount) {
          return {
            success: false,
            error: "Missing required fields",
            message: "Both reactorIndex and amount are required for withdrawal",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot withdraw: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Execute withdrawal
        const result = await starknetChain.write({
          contractAddress: conduitAddress,
          entrypoint: "withdraw",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex),
            ...toUint256WithSpread(args.amount)
          ]
        });

        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            error: 'Transaction failed',
            message: `Failed to withdraw ${args.amount} LP tokens from reactor ${args.reactorIndex}: Transaction unsuccessful`,
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            amount: args.amount,
            transactionHash: result.transactionHash,
            receipt: result
          },
          message: `Successfully withdrew ${args.amount} LP tokens from reactor ${args.reactorIndex}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to withdraw from reactor:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to withdraw from reactor',
          message: `Failed to withdraw from reactor: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reactor withdrawal failed:`, error);
      ctx.emit("reactorWithdrawalError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "exitReactor",
    description: "Withdraws all LP tokens and rewards from a nuclear reactor",
    instructions: "Use this action when an agent wants to completely exit a reactor, withdrawing all LP tokens and harvesting all rewards",
    schema: z.object({
      reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex) {
          return {
            success: false,
            error: "Missing required field",
            message: "ReactorIndex is required for exiting a reactor",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot exit reactor: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Get current staked amount for logging
        const agentAddress = await getAgentAddress();
        let stakedAmount: string = "unknown";
        
        try {
          const balance = await starknetChain.read({
            contractAddress: conduitAddress,
            entrypoint: "balance_of",
            calldata: [
              ...toUint256WithSpread(args.reactorIndex),
              agentAddress
            ]
          });
          stakedAmount = convertU256ToDecimal(balance[0], balance[1]).toString();
        } catch (e) {
          // Non-critical error, continue with exit
          console.warn("Could not fetch staked amount before exit:", e);
        }
        
        // Execute exit
        const result = await starknetChain.write({
          contractAddress: conduitAddress,
          entrypoint: "exit",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        });

        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            error: 'Transaction failed',
            message: `Failed to exit reactor ${args.reactorIndex}: Transaction unsuccessful`,
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            exitedAmount: stakedAmount,
            transactionHash: result.transactionHash,
            receipt: result
          },
          message: `Successfully exited reactor ${args.reactorIndex}, withdrew all LP tokens (approximately ${stakedAmount})`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to exit reactor:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to exit reactor',
          message: `Failed to exit reactor: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reactor exit failed:`, error);
      ctx.emit("reactorExitError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "harvestRewards",
    description: "Claims accumulated reward tokens from a nuclear reactor",
    instructions: "Use this action when an agent wants to collect earned rewards without withdrawing their staked LP tokens",
    schema: z.object({
        reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex) {
          return {
            success: false,
            error: "Missing required field",
            message: "ReactorIndex is required for harvesting rewards",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot harvest rewards: conduit contract address not found in configuration",
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
            contractAddress: conduitAddress,
            entrypoint: "get_reward_tokens",
            calldata: [
              ...toUint256WithSpread(args.reactorIndex)
            ]
          });
          
          rewardTokens = Array.isArray(rewardTokensResponse) ? rewardTokensResponse : [rewardTokensResponse];
          
          // Get pending amounts for each token
          for (const token of rewardTokens) {
            const earned = await starknetChain.read({
              contractAddress: conduitAddress,
              entrypoint: "earned",
              calldata: [
                  ...toUint256WithSpread(args.reactorIndex),
                  agentAddress,
                  token
              ]
            });
            
            pendingRewards[token] = convertU256ToDecimal(earned[0], earned[1]).toString();
          }
        } catch (e) {
          // Non-critical error, continue with harvest
          console.warn("Could not fetch pending rewards before harvest:", e);
        }
        
        // Execute harvest
        const result = await starknetChain.write({
          contractAddress: conduitAddress,
          entrypoint: "harvest",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        });

        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            error: 'Transaction failed',
            message: `Failed to harvest rewards from reactor ${args.reactorIndex}: Transaction unsuccessful`,
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            rewardTokens,
            harvestedAmounts: pendingRewards,
            transactionHash: result.transactionHash,
            receipt: result
          },
          message: `Successfully harvested rewards from reactor ${args.reactorIndex}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to harvest rewards:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to harvest rewards',
          message: `Failed to harvest rewards: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reward harvest failed:`, error);
      ctx.emit("rewardHarvestError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "checkPendingRewards",
    description: "Checks the amount of pending rewards for a specific token in a reactor",
    instructions: "Use this action when an agent wants to know how much of a specific reward token they've earned",
    schema: z.object({
        reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)"),
        rewardToken: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Reward token contract address (must be a valid hex address starting with 0x)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex || !args.rewardToken) {
          return {
            success: false,
            error: "Missing required fields",
            message: "Both reactorIndex and rewardToken are required for checking pending rewards",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot check pending rewards: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Get agent address
        const agentAddress = await getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            error: "Agent address not found",
            message: "Cannot check pending rewards: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }
        
        // Get earned amount
        const earned = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "earned",
          calldata: [
              ...toUint256WithSpread(args.reactorIndex),
              agentAddress,
            args.rewardToken
          ]
        });
        
        const earnedAmount = convertU256ToDecimal(earned[0], earned[1]).toString();
        
        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            rewardToken: args.rewardToken,
            earnedAmount
          },
          message: `You have ${earnedAmount} of reward token ${args.rewardToken} pending in reactor ${args.reactorIndex}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to check reactor rewards:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check reactor rewards',
          message: `Failed to check pending rewards: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Pending rewards check failed:`, error);
      ctx.emit("pendingRewardsError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getReactorLpToken",
    description: "Retrieves the LP token address accepted by a specific reactor",
    instructions: "Use this action when an agent needs to know which LP token to approve before depositing to a reactor",
    schema: z.object({
      reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex) {
          return {
            success: false,
            error: "Missing required field",
            message: "ReactorIndex is required for getting LP token address",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot get LP token: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Get LP token address
        const lpTokenResponse = toHex(await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_lp_token",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        }));

        const lpToken = Array.isArray(lpTokenResponse) ? lpTokenResponse[0] : lpTokenResponse;

        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            lpToken
          },
          message: `The LP token for reactor ${args.reactorIndex} is ${lpToken}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get LP token:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get LP token',
          message: `Failed to get LP token: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`LP token lookup failed:`, error);
      ctx.emit("lpTokenLookupError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getAgentStakedAmount",
    description: "Retrieves the amount of LP tokens an agent has staked in a reactor",
    instructions: "Use this action when an agent wants to check how many LP tokens they have staked in a specific reactor",
    schema: z.object({
      reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex) {
          return {
            success: false,
            error: "Missing required field",
            message: "ReactorIndex is required for getting staked amount",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot get staked amount: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Get agent address
        const agentAddress = await getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            error: "Agent address not found",
            message: "Cannot get staked amount: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }
        
        // Get balance
        const balance = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "balance_of",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex),
            agentAddress
          ]
        });

        const stakedAmount = convertU256ToDecimal(balance[0], balance[1]).toString();
        
        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            stakedAmount
          },
          message: `You have ${stakedAmount} LP tokens staked in reactor ${args.reactorIndex}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get balance:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user staked amount',
          message: `Failed to get staked amount: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Staked amount query failed:`, error);
      ctx.emit("stakedAmountError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getReactorTotalDeposited",
    description: "Gets the total amount of LP tokens deposited in a reactor",
    instructions: "Use this action when an agent needs to know the total amount of LP tokens staked by all agents in a reactor",
    schema: z.object({
      reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex) {
          return {
            success: false,
            error: "Missing required field",
            message: "ReactorIndex is required for getting total deposited amount",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot get total deposited: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Get total deposited
        const totalDeposited = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "total_deposited",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        });

        const totalDepositedAmount = convertU256ToDecimal(totalDeposited[0], totalDeposited[1]).toString();
        
        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            totalDepositedAmount
          },
          message: `Total deposits in reactor ${args.reactorIndex} amount to ${totalDepositedAmount} LP tokens`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get total deposited:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get total deposited amount',
          message: `Failed to get total deposited amount: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Total deposits query failed:`, error);
      ctx.emit("totalDepositsError", { action: ctx.call.name, error: error.message });
    }
  }),
  
  action({
    name: "getReactorAddress",
    description: "Retrieves the contract address of a specific reactor",
    instructions: "Use this action when an agent needs to get the contract address of a reactor for direct interaction",
    schema: z.object({
      reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex) {
          return {
            success: false,
            error: "Missing required field",
            message: "ReactorIndex is required for getting reactor address",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot get reactor address: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Get reactor address
        const reactorAddress = toHex(await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_farm_address",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        }));

        const formattedAddress = Array.isArray(reactorAddress) ? reactorAddress[0] : reactorAddress;
        
        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            reactorAddress: formattedAddress
          },
          message: `The address for reactor ${args.reactorIndex} is ${formattedAddress}`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get reactor address:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get reactor address',
          message: `Failed to get reactor address: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reactor address lookup failed:`, error);
      ctx.emit("reactorAddressError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "getReactorRewardTokens",
    description: "Gets the list of reward tokens available from a specific reactor",
    instructions: "Use this action when an agent needs to know which reward tokens they can earn from a reactor",
    schema: z.object({
      reactorIndex: z.string().describe("Unique reactor identifier in the Conduit contract (numeric index as string)")
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (!args.reactorIndex) {
          return {
            success: false,
            error: "Missing required field",
            message: "ReactorIndex is required for getting reward tokens",
            timestamp: Date.now(),
          };
        }

        // Get contract address
        const conduitAddress = getContractAddress('core', 'conduit');
        if (!conduitAddress) {
          return {
            success: false,
            error: "Conduit address not found",
            message: "Cannot get reward tokens: conduit contract address not found in configuration",
            timestamp: Date.now(),
          };
        }
        
        // Get reward tokens
        const rewardTokens = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_reward_tokens",
          calldata: [
            ...toUint256WithSpread(args.reactorIndex)
          ]
        });

        const formattedTokens = Array.isArray(rewardTokens) ? rewardTokens : [rewardTokens];
        
        return {
          success: true,
          data: {
            reactorIndex: args.reactorIndex,
            rewardTokens: formattedTokens
          },
          message: `Reactor ${args.reactorIndex} has ${formattedTokens.length} reward token(s)`,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get reward tokens:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get reward tokens',
          message: `Failed to get reward tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Reward tokens query failed:`, error);
      ctx.emit("rewardTokensError", { action: ctx.call.name, error: error.message });
    }
  }),
]; 