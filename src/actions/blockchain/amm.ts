import { action } from "@daydreamsai/core";
import { z } from "zod";
import { convertU256ToDecimal, getTokenBalance, starknetChain, toHex } from "../../utils/starknet";
import { toUint256WithSpread, calculateOptimalLiquidity } from "../../utils/starknet";
import { executeMultiCall, getApproveCall } from '../../utils/starknet';
import { getContractAddress } from "src/utils/contracts";
import { getAgentAddress } from "../../utils/starknet";

export const ammActions = [
  // Router Operations - Price Calculations
  action({
    name: "getAmountOut",
    description: "Calculate the exact output amount for a token swap given an input amount and the current reserves of both tokens. Uses the constant product formula (x * y = k) to determine the new price after the swap. Accounts for fees and slippage in the calculation. Returns the maximum output amount possible for the given input.",
    schema: z.object({
      tokenIn: z.string().describe("The address of the token you want to swap from"),
      tokenOut: z.string().describe("The address of the token you want to receive"),
      amountIn: z.string().describe("Input amount (in token base units)"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const routerAddress = getContractAddress('core', 'router');

        const factoryAddress = toHex(await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "factory",
          calldata: []
        }));
  
        const pairAddress = toHex(await starknetChain.read({
          contractAddress: factoryAddress,
          entrypoint: "get_pair",
          calldata: [call.data.tokenIn, call.data.tokenOut]
        }));

        const reserves = await starknetChain.read({
          contractAddress: pairAddress,
          entrypoint: "get_reserves",
          calldata: []
        });
        const reserveIn = convertU256ToDecimal(reserves[0], reserves[1]);
        const reserveOut = convertU256ToDecimal(reserves[2], reserves[3]);
        const result = await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "get_amount_out",
          calldata: [
            ...toUint256WithSpread(call.data.amountIn),
            ...toUint256WithSpread(reserveIn.toString()),
            ...toUint256WithSpread(reserveOut.toString())
          ]
        });
        return {
          success: true,
          amountOut: convertU256ToDecimal(result[0], result[1]),
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to calculate amount out:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to calculate amount out',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "quote",
    description: "Provides a price quote for exchanging tokens based on the current reserves in the liquidity pool. Calculates the equivalent amount of token B you would receive for a given amount of token A, taking into account the current ratio of reserves. This is a pure calculation that doesn't account for fees or slippage, useful for price estimation purposes.",
    schema: z.object({
      tokenIn: z.string().describe("The address of the token you want to swap from"),
      tokenOut: z.string().describe("The address of the token you want to receive"),
      amountIn: z.string().describe("Input amount (MUST be in token base units)"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const routerAddress = getContractAddress('core', 'router');

        const factoryAddress = toHex(await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "factory",
          calldata: []
        }));
  
        const pairAddress = toHex(await starknetChain.read({
          contractAddress: factoryAddress,
          entrypoint: "get_pair",
          calldata: [call.data.tokenIn, call.data.tokenOut]
        }));

        const reserves = await starknetChain.read({
          contractAddress: pairAddress,
          entrypoint: "get_reserves",
          calldata: []
        });
        const reserveIn = convertU256ToDecimal(reserves[0], reserves[1]);
        const reserveOut = convertU256ToDecimal(reserves[2], reserves[3]);
        const result = await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "quote",
          calldata: [
            ...toUint256WithSpread(call.data.amountIn),
            ...toUint256WithSpread(reserveIn.toString()),
            ...toUint256WithSpread(reserveOut.toString())
          ]
        });
        return {
          success: true,
          amountOut: convertU256ToDecimal(result[0], result[1]),
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to calculate quote:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to calculate quote',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "swapExactTokensForTokens",
    description: "Execute a token swap with an exact input amount for a minimum output amount. Automatically finds the best route between the input and output tokens, handling multi-hop swaps if needed. Includes slippage protection through amountOutMin parameter and deadline for transaction validity. Automatically handles token approvals and executes the swap in a single transaction.",
    schema: z.object({
      tokenIn: z.string().describe("The address of the token you want to swap from"),
      tokenOut: z.string().describe("The address of the token you want to receive"),
      amountIn: z.string().describe("Exact amount of input tokens to be swapped (in token base units)"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Construct the path array - for now using direct path, TODO: implement path finding
        const path = [call.data.tokenIn, call.data.tokenOut];
        const routerAddress = getContractAddress('core', 'router');
        const agentAddress = await getAgentAddress();
        
        // Create approve call for input token
        const approveCall = getApproveCall(
          call.data.tokenIn,
          routerAddress,
          call.data.amountIn
        );
        
        // Create swap call
        const swapCall = {
          contractAddress: routerAddress,
          entrypoint: "swap_exact_tokens_for_tokens",
          calldata: [
            ...toUint256WithSpread(call.data.amountIn),
            ...toUint256WithSpread("0"),
            path.length.toString(),
            ...path,
            agentAddress,
            Date.now() + 1000 * 60 * 10 // 10 minutes from now
          ]
        };

        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, swapCall]);
        
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
          receipt: result.receipt,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to execute swap:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to execute swap',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "addLiquidity",
    description: "Add liquidity to an AMM pool by depositing a pair of tokens. Handles first-time pool creation and manages existing pools. Includes approval transactions for both tokens, executes all necessary transactions in a single multicall for gas efficiency.",
    schema: z.object({
      tokenA: z.string().describe("Address of the first token in the pair"),
      tokenB: z.string().describe("Address of the second token in the pair"),
      amountADesired: z.string().describe("Desired amount of first token to add (MUST be in token base units)"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const routerAddress = getContractAddress('core', 'router');
        const agentAddress = await getAgentAddress();
        const optimalAmounts = await calculateOptimalLiquidity({
            contractAddress: routerAddress,
            tokenA: call.data.tokenA,
            tokenB: call.data.tokenB,
            amountA: call.data.amountADesired
        });
      
        const amountA = optimalAmounts.amountA;
        const amountB = optimalAmounts.amountB;
        const balanceA = await getTokenBalance(call.data.tokenA, agentAddress);
        const balanceB = await getTokenBalance(call.data.tokenB, agentAddress);
        if (balanceA < BigInt(amountA)) {
          return {
            success: false,
            error: 'Insufficient balance for token A, consider decreasing amountADesired',
            balanceA,
            amountA,
            timestamp: Date.now(),
          };
        }
        if (balanceB < BigInt(amountB)) {
          return {
            success: false,
            error: 'Insufficient balance for token B, consider decreasing amountADesired',
            balanceB,
            amountB,
            timestamp: Date.now(),
          };
        }
        // Create approve calls for both tokens
        const approveCallA = getApproveCall(
          call.data.tokenA,
          routerAddress,
          amountA
        );
        const approveCallB = getApproveCall(
          call.data.tokenB,
          routerAddress,
          amountB
        );
        // Create add liquidity call
        const addLiquidityCall = {
          contractAddress: routerAddress,
          entrypoint: "add_liquidity",
          calldata: [
            call.data.tokenA,
            call.data.tokenB,
            ...toUint256WithSpread(amountA),
            ...toUint256WithSpread(amountB),
            ...toUint256WithSpread("0"),
            ...toUint256WithSpread("0"),
            agentAddress,
            Date.now() + 1000 * 60 * 10 // 10 minutes from now
          ]
        };

        // Execute all calls using multicall
        const result = await executeMultiCall([approveCallA, approveCallB, addLiquidityCall]);
        
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
          receipt: result.receipt,
          amounts: {
            amountA,
            amountB,
            isFirstProvision: optimalAmounts.isFirstProvision
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to add liquidity:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add liquidity',
          timestamp: Date.now(),
        };
      }
    },
  }),

  action({
    name: "removeLiquidity",
    description: "Remove liquidity from an AMM pool by burning LP tokens. Withdraws both tokens from the pool proportionally to the amount of LP tokens burned. Includes slippage protection through minimum amount parameters, handles token approvals, and executes the removal in a single transaction. Returns full transaction details including the amounts of tokens received.",
    schema: z.object({
      tokenA: z.string().describe("Address of the first token to receive"),
      tokenB: z.string().describe("Address of the second token to receive"),
      liquidity: z.string().describe("Amount of LP tokens to burn for withdrawing liquidity (in token base units)"),
    }),
    handler: async (call, ctx, agent) => {
      try {
        const routerAddress = getContractAddress('core', 'router');
        const agentAddress = await getAgentAddress();

        const pairAddress = toHex(await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "get_pair_address",
          calldata: [call.data.tokenA, call.data.tokenB]
        }));
        // Create approve call for LP token
        const approveCall = getApproveCall(
          pairAddress,
          routerAddress,
          call.data.liquidity
        );

        // Create remove liquidity call
        const removeLiquidityCall = {
          contractAddress: routerAddress,
          entrypoint: "remove_liquidity",
          calldata: [
            call.data.tokenA,
            call.data.tokenB,
            ...toUint256WithSpread(call.data.liquidity),
            ...toUint256WithSpread("0"),
            ...toUint256WithSpread("0"),
            agentAddress,
            Date.now() + 1000 * 60 * 10 // 10 minutes from now
          ]
        };

        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, removeLiquidityCall]);

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
          receipt: result.receipt,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error('Failed to remove liquidity:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove liquidity',
          timestamp: Date.now(),
        };
      }
    },
  }),
]; 
