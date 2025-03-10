import { action } from "@daydreamsai/core";
import { z } from "zod";
import { convertU256ToDecimal, starknetChain, toHex } from "../../utils/starknet";
import { toUint256WithSpread } from "../../utils/starknet";
import { executeMultiCall, getApproveCall } from '../../utils/starknet';
import { getContractAddress } from "src/utils/contracts";
import { getAgentAddress } from "../../utils/starknet";

export const yieldActions = [
  action({
    name: "depositToReactor",
    description: "Deposits LP (Liquidity Provider) tokens into a nuclear reactor for yield farming. Automatically handles token approvals and executes a multicall transaction for gas efficiency. The deposit enables earning rewards through the reactor's yield generation mechanism. Returns transaction details including hash and receipt for tracking.",
    schema: z.object({
        reactorIndex: z.string().describe("Unique identifier index of the target reactor in the Conduit contract (retrieved from getReactorIndexByLpToken action)"),
        amount: z.string().describe("Amount of LP tokens to deposit (in token base units)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
        const reactorAddress = toHex(await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_reactor_address",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        }));
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
            transactionHash: result.transactionHash,
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          transactionHash: result.transactionHash,
          receipt: result.receipt
        };
      } catch (error) {
        console.error('Failed to deposit to reactor:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to deposit to reactor',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "withdrawFromReactor",
    description: "Withdraws a specified amount of LP tokens from a nuclear reactor. Allows partial withdrawals while keeping remaining tokens staked. The withdrawal process automatically claims any pending rewards. Transaction is executed as a single operation and returns detailed transaction information.",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to withdraw from (retrieved from getReactorIndexByLpToken action)"),
      amount: z.string().describe("Amount of LP tokens to withdraw (in token base units)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
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
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          transactionHash: result.transactionHash,
          receipt: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to withdraw from reactor:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to withdraw from reactor',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "exitReactor",
    description: "Performs a complete withdrawal from a nuclear reactor, removing all deposited LP tokens and harvesting accumulated rewards in a single transaction. This is an optimized operation for full exit scenarios, saving gas compared to separate withdraw and harvest calls. Returns comprehensive transaction details.",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to exit from (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
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
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          transactionHash: result.transactionHash,
          receipt: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to exit reactor:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to exit reactor',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "harvestRewards",
    description: "Claims all accumulated reward tokens from a nuclear reactor without withdrawing the staked LP tokens. Supports multiple reward tokens if the reactor offers them. The harvested rewards are automatically transferred to the caller's address. Returns transaction details for the harvest operation.",
    schema: z.object({
        reactorIndex: z.string().describe("Unique identifier index of the reactor to harvest rewards from (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
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
            transactionHash: result.transactionHash,
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          transactionHash: result.transactionHash,
          receipt: result,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to harvest rewards:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to harvest rewards',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "checkPendingRewards",
    description: "Queries the current amount of pending rewards for a specific reward token in a reactor. Returns the pending rewards. This is a view function that doesn't modify state or require gas. Essential for monitoring yield farming progress.",
    schema: z.object({
        reactorIndex: z.string().describe("Unique identifier index of the reactor to check rewards for (retrieved from getReactorIndexByLpToken action)"),
        rewardToken: z.string().describe("The Starknet address of the specific reward token to query")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
        const agentAddress = await getAgentAddress();
        
        const earned = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "earned",
          calldata: [
              ...toUint256WithSpread(call.data.reactorIndex),
              agentAddress,
            call.data.rewardToken
          ]
        });
        return {
          success: true,
          earnedAmount : convertU256ToDecimal(earned[0], earned[1]),
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to check reactor rewards:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check reactor rewards',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getReactorLpToken",
    description: "Retrieves the Starknet address of the LP token accepted by a specific reactor. This view function helps verify the correct token for deposits and integrates with other DeFi operations. Essential for token approval operations and balance checks before deposits.",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to query (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
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
          lpToken,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get LP token:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get LP token',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getUserStakedAmount",
    description: "Retrieves the current amount of LP tokens a user has staked in a specific reactor. Supports querying any account address, defaulting to the agent's address if none specified. Returns the staked balance in the token's smallest unit. Essential for monitoring staking positions and calculating rewards.",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to check balance in (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
        const agentAddress = await getAgentAddress();
        const balance = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "balance_of",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex),
            agentAddress
          ]
        });

        return {
          success: true,
          balance : convertU256ToDecimal(balance[0], balance[1]),
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get balance:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user staked amount',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getReactorTotalDeposited",
    description: "Queries the total amount of LP tokens currently deposited in a specific reactor by all users. This view function is crucial for calculating market share, APR/APY rates, and understanding the reactor's total capacity. Returns the total in the token's smallest unit.",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to query total deposits for (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
        const totalDeposited = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "total_deposited",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        });

        return {
          success: true,
          totalDeposited : convertU256ToDecimal(totalDeposited[0], totalDeposited[1]),
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get total deposited:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get total deposited amount',
          timestamp: Date.now(),
        };
      }
    },
  }),
  action({
    name: "getReactorAddress",
    description: "Retrieves the Starknet contract address of a specific reactor using its index. This view function is essential for direct interactions with the reactor contract and verification of reactor deployment. Returns the full Starknet address of the reactor contract.",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to get the address for (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
        const reactorAddress = toHex(await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_reactor_address",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        }));

        return {
          success: true,
          reactorAddress: Array.isArray(reactorAddress) ? reactorAddress[0] : reactorAddress,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get reactor address:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get reactor address',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "getReactorRewardTokens",
    description: "Fetches an array of all reward token addresses that can be earned in a specific reactor. Essential for tracking multiple reward types and integrating with token contracts for reward claims. Returns a list of Starknet addresses for each reward token available.",
    schema: z.object({
      reactorIndex: z.string().describe("Unique identifier index of the reactor to query reward tokens for (retrieved from getReactorIndexByLpToken action)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        const conduitAddress = getContractAddress('core', 'conduit');
        const rewardTokens = await starknetChain.read({
          contractAddress: conduitAddress,
          entrypoint: "get_reward_tokens",
          calldata: [
            ...toUint256WithSpread(call.data.reactorIndex)
          ]
        });

        return {
          success: true,
          rewardTokens: Array.isArray(rewardTokens) ? rewardTokens : [rewardTokens],
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to get reward tokens:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get reward tokens',
          timestamp: Date.now(),
        };
      }
    },
  }),
]; 