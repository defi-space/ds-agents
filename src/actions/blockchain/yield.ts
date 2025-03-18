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
    description: "Deposits LP (Liquidity Provider) tokens into a nuclear reactor for yield farming. Automatically handles token approvals and executes a multicall transaction for gas efficiency. The deposit enables earning rewards through the reactor's yield generation mechanism. Example: depositToReactor({ reactorIndex: '1', amount: '1000000000000000000' })",
    schema: z.object({
        reactorIndex: z.string().describe("Unique identifier index of the target reactor in the Conduit contract (retrieved from getReactorIndexByLpToken action)"),
        amount: z.string().describe("Amount of LP tokens to deposit (in token base units)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex || !call.data.amount) {
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
          entrypoint: "get_reactor_address",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        }));
        
        // Get LP token address
        const lpToken = toHex(await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_lp_token",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        }));

        // Create approve call for LP token
        const approveCall = getApproveCall(
          lpToken,
          reactorAddress,
          call.data.amount
        );
        
        // Create deposit call
        const depositCall = {
          contractAddress: conduitAddress,
          entrypoint: "deposit",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex),
            ...toUint256WithSpread(call.data.amount)
          ]
        };
        
        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, depositCall]);
        
        if (result.receipt?.statusReceipt !== 'success') {
          return {
            success: false,
            error: result.error || 'Transaction failed',
            message: `Failed to deposit ${call.data.amount} LP tokens to reactor ${call.data.reactorIndex}: ${result.error || 'Transaction unsuccessful'}`,
            transactionHash: result.transactionHash,
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            amount: call.data.amount,
            lpToken,
            transactionHash: result.transactionHash,
            receipt: result.receipt
          },
          message: `Successfully deposited ${call.data.amount} LP tokens to reactor ${call.data.reactorIndex}`,
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
  }),

  action({
    name: "withdrawFromReactor",
    description: "Withdraws a specified amount of LP tokens from a nuclear reactor. Allows partial withdrawals while keeping remaining tokens staked. The withdrawal process automatically claims any pending rewards. Example: withdrawFromReactor({ reactorIndex: '1', amount: '500000000000000000' })",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to withdraw from (retrieved from getReactorIndexByLpToken action)"),
      amount: z.string().describe("Amount of LP tokens to withdraw (in token base units)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex || !call.data.amount) {
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
            ...toUint256WithSpread(call.data.reactorIndex),
            ...toUint256WithSpread(call.data.amount)
          ]
        });

        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            error: 'Transaction failed',
            message: `Failed to withdraw ${call.data.amount} LP tokens from reactor ${call.data.reactorIndex}: Transaction unsuccessful`,
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            amount: call.data.amount,
            transactionHash: result.transactionHash,
            receipt: result
          },
          message: `Successfully withdrew ${call.data.amount} LP tokens from reactor ${call.data.reactorIndex}`,
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
  }),

  action({
    name: "exitReactor",
    description: "Performs a complete withdrawal from a nuclear reactor, removing all deposited LP tokens and harvesting accumulated rewards in a single transaction. This is an optimized operation for full exit scenarios. Example: exitReactor({ reactorIndex: '1' })",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to exit from (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex) {
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
              ...toUint256WithSpread(call.data.reactorIndex),
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
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        });

        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            error: 'Transaction failed',
            message: `Failed to exit reactor ${call.data.reactorIndex}: Transaction unsuccessful`,
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            exitedAmount: stakedAmount,
            transactionHash: result.transactionHash,
            receipt: result
          },
          message: `Successfully exited reactor ${call.data.reactorIndex}, withdrew all LP tokens (approximately ${stakedAmount})`,
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
  }),

  action({
    name: "harvestRewards",
    description: "Claims all accumulated reward tokens from a nuclear reactor without withdrawing the staked LP tokens. Supports multiple reward tokens if the reactor offers them. Example: harvestRewards({ reactorIndex: '1' })",
    schema: z.object({
        reactorIndex: z.string().describe("Unique identifier index of the reactor to harvest rewards from (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex) {
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
              ...toUint256WithSpread(call.data.reactorIndex)
            ]
          });
          
          rewardTokens = Array.isArray(rewardTokensResponse) ? rewardTokensResponse : [rewardTokensResponse];
          
          // Get pending amounts for each token
          for (const token of rewardTokens) {
            const earned = await starknetChain.read({
              contractAddress: conduitAddress,
              entrypoint: "earned",
              calldata: [
                  ...toUint256WithSpread(call.data.reactorIndex),
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
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        });

        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            error: 'Transaction failed',
            message: `Failed to harvest rewards from reactor ${call.data.reactorIndex}: Transaction unsuccessful`,
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            rewardTokens,
            harvestedAmounts: pendingRewards,
            transactionHash: result.transactionHash,
            receipt: result
          },
          message: `Successfully harvested rewards from reactor ${call.data.reactorIndex}`,
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
  }),

  action({
    name: "checkPendingRewards",
    description: "Queries the current amount of pending rewards for a specific reward token in a reactor. Essential for monitoring yield farming progress. Example: checkPendingRewards({ reactorIndex: '1', rewardToken: '0x123abc...' })",
    schema: z.object({
        reactorIndex: z.string().describe("Unique identifier index of the reactor to check rewards for (retrieved from getReactorIndexByLpToken action)"),
        rewardToken: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the specific reward token to query")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex || !call.data.rewardToken) {
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
              ...toUint256WithSpread(call.data.reactorIndex),
              agentAddress,
            call.data.rewardToken
          ]
        });
        
        const earnedAmount = convertU256ToDecimal(earned[0], earned[1]).toString();
        
        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            rewardToken: call.data.rewardToken,
            earnedAmount
          },
          message: `You have ${earnedAmount} of reward token ${call.data.rewardToken} pending in reactor ${call.data.reactorIndex}`,
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
  }),

  action({
    name: "getReactorLpToken",
    description: "Retrieves the Starknet address of the LP token accepted by a specific reactor. Essential for token approval operations and balance checks before deposits. Example: getReactorLpToken({ reactorIndex: '1' })",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to query (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex) {
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
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        }));

        const lpToken = Array.isArray(lpTokenResponse) ? lpTokenResponse[0] : lpTokenResponse;

        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            lpToken
          },
          message: `The LP token for reactor ${call.data.reactorIndex} is ${lpToken}`,
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
  }),

  action({
    name: "getUserStakedAmount",
    description: "Retrieves the current amount of LP tokens a user has staked in a specific reactor. Essential for monitoring staking positions and calculating rewards. Example: getUserStakedAmount({ reactorIndex: '1' })",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to check balance in (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex) {
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
            ...toUint256WithSpread(call.data.reactorIndex),
            agentAddress
          ]
        });

        const stakedAmount = convertU256ToDecimal(balance[0], balance[1]).toString();
        
        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            stakedAmount
          },
          message: `You have ${stakedAmount} LP tokens staked in reactor ${call.data.reactorIndex}`,
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
  }),

  action({
    name: "getReactorTotalDeposited",
    description: "Queries the total amount of LP tokens currently deposited in a specific reactor by all users. Crucial for calculating market share and APR/APY rates. Example: getReactorTotalDeposited({ reactorIndex: '1' })",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to query total deposits for (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex) {
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
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        });

        const totalDepositedAmount = convertU256ToDecimal(totalDeposited[0], totalDeposited[1]).toString();
        
        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            totalDepositedAmount
          },
          message: `Total deposits in reactor ${call.data.reactorIndex} amount to ${totalDepositedAmount} LP tokens`,
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
  }),
  
  action({
    name: "getReactorAddress",
    description: "Retrieves the Starknet contract address of a specific reactor using its index. Essential for direct interactions with the reactor contract. Example: getReactorAddress({ reactorIndex: '1' })",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to get the address for (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex) {
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
          entrypoint: "get_reactor_address",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        }));

        const formattedAddress = Array.isArray(reactorAddress) ? reactorAddress[0] : reactorAddress;
        
        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            reactorAddress: formattedAddress
          },
          message: `The address for reactor ${call.data.reactorIndex} is ${formattedAddress}`,
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
  }),

  action({
    name: "getReactorRewardTokens",
    description: "Fetches an array of all reward token addresses that can be earned in a specific reactor. Essential for tracking multiple reward types. Example: getReactorRewardTokens({ reactorIndex: '1' })",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to query reward tokens for (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.reactorIndex) {
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
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        });

        const formattedTokens = Array.isArray(rewardTokens) ? rewardTokens : [rewardTokens];
        
        return {
          success: true,
          data: {
            reactorIndex: call.data.reactorIndex,
            rewardTokens: formattedTokens
          },
          message: `Reactor ${call.data.reactorIndex} has ${formattedTokens.length} reward token(s)`,
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
  }),
]; 