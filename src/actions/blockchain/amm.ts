import { action } from "@daydreamsai/core";
import { z } from "zod";
import { convertU256ToDecimal, getTokenBalance, starknetChain, toHex } from "../../utils/starknet";
import { toUint256WithSpread, calculateOptimalLiquidity } from "../../utils/starknet";
import { executeMultiCall, getApproveCall } from '../../utils/starknet';
import { getContractAddress } from "../../utils/contracts";
import { getAgentAddress } from "../../utils/starknet";

export const ammActions = [
  // Router Operations - Price Calculations
  action({
    name: "getAmountOut",
    description: "Calculates the exact output amount for a token swap given an input amount using the AMM's constant product formula (x * y = k).",
    instructions: "Use this action when an agent needs to know how much of a token they will receive for a specific amount of another token.",
    schema: z.object({
      tokenIn: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address to swap from (must be a valid hex address starting with 0x)"),
      tokenOut: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address to receive (must be a valid hex address starting with 0x)"),
      amountIn: z.string().describe("Amount of input tokens as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Input validation
        if (args.tokenIn === args.tokenOut) {
          return {
            success: false,
            error: "Token addresses must be different",
            message: "Cannot calculate amount out: input and output tokens are the same",
            timestamp: Date.now()
          };
        }
        
        const { tokenIn, tokenOut, amountIn } = args;
        
        // Get contract addresses
        const routerAddress = getContractAddress('core', 'router');
        if (!routerAddress) {
          return {
            success: false,
            error: "Router address not found",
            message: "Cannot calculate amount out: router contract address not found",
            timestamp: Date.now()
          };
        }

        // Get factory address
        const factoryAddress = toHex(await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "factory",
          calldata: []
        }));
        
        // Get pair address
        const pairAddress = toHex(await starknetChain.read({
          contractAddress: factoryAddress,
          entrypoint: "get_pair",
          calldata: [tokenIn, tokenOut]
        }));
        
        if (pairAddress === "0x0" || pairAddress === "0x00") {
          return {
            success: false,
            error: "Liquidity pair not found",
            message: `Cannot calculate amount out: no liquidity pair exists for ${tokenIn} and ${tokenOut}`,
            timestamp: Date.now()
          };
        }

        // Get reserves
        const reserves = await starknetChain.read({
          contractAddress: pairAddress,
          entrypoint: "get_reserves",
          calldata: []
        });
        
        const reserveIn = convertU256ToDecimal(reserves[0], reserves[1]);
        const reserveOut = convertU256ToDecimal(reserves[2], reserves[3]);
        
        // Check if reserves are sufficient - fix for type error
        if (reserveIn.toString() === "0" || reserveOut.toString() === "0") {
          return {
            success: false,
            error: "Insufficient liquidity",
            message: "Cannot calculate amount out: insufficient liquidity in the pool",
            timestamp: Date.now()
          };
        }
        
        // Calculate amount out
        const result = await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "get_amount_out",
          calldata: [
            ...toUint256WithSpread(amountIn),
            ...toUint256WithSpread(reserveIn.toString()),
            ...toUint256WithSpread(reserveOut.toString())
          ]
        });
        
        const amountOut = convertU256ToDecimal(result[0], result[1]);
        
        return {
          success: true,
          data: {
            amountOut,
            reserveIn,
            reserveOut,
            pairAddress
          },
          message: `For ${amountIn} of token ${tokenIn}, you will receive approximately ${amountOut} of token ${tokenOut}`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get amount out:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to calculate output amount",
          message: `Failed to calculate swap output amount: ${(error as Error).message}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Action ${ctx.call.name} failed:`, error);
      ctx.emit("actionError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "quote",
    description: "Provides a price quote for exchanging tokens based on current pool reserves without considering fees or slippage.",
    instructions: "Use this action when an agent needs a simple price estimate for token exchange based on current market conditions.",
    schema: z.object({
      tokenIn: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address to swap from (must be a valid hex address starting with 0x)"),
      tokenOut: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address to receive (must be a valid hex address starting with 0x)"),
      amountIn: z.string().describe("Amount of input tokens as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)"),
    }),
    handler: async (args, ctx, agent) => {
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
          calldata: [args.tokenIn, args.tokenOut]
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
            ...toUint256WithSpread(args.amountIn),
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
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Action ${ctx.call.name} failed:`, error);
      ctx.emit("actionError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "swapExactTokensForTokens",
    description: "Executes a token swap with exact input amount, handling approvals and execution in a single transaction.",
    instructions: "Use this action when an agent needs to swap a specific amount of one token for another. The system automatically handles approvals and finds the best exchange rate.",
    schema: z.object({
      tokenIn: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address to swap from (must be a valid hex address starting with 0x)"),
      tokenOut: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Token contract address to receive (must be a valid hex address starting with 0x)"),
      amountIn: z.string().describe("Exact amount of tokens to swap as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Construct the path array - for now using direct path, TODO: implement path finding
        const path = [args.tokenIn, args.tokenOut];
        const routerAddress = getContractAddress('core', 'router');
        const agentAddress = await getAgentAddress();
        
        // Get factory address
        const factoryAddress = toHex(await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "factory",
          calldata: []
        }));
        
        // Check if pair exists
        const pairAddress = toHex(await starknetChain.read({
          contractAddress: factoryAddress,
          entrypoint: "get_pair",
          calldata: [args.tokenIn, args.tokenOut]
        }));
        
        if (pairAddress === "0x0" || pairAddress === "0x00") {
          return {
            success: false,
            error: "Liquidity pair not found",
            message: `Cannot execute swap: no liquidity pair exists for ${args.tokenIn} and ${args.tokenOut}. Please check context to get available pairs.`,
            timestamp: Date.now()
          };
        }
        
        // Create approve args for input token
        const approveCall = getApproveCall(
          args.tokenIn,
          routerAddress,
          args.amountIn
        );
        
        // Create swap args
        const swapCall = {
          contractAddress: routerAddress,
          entrypoint: "swap_exact_tokens_for_tokens",
          calldata: [
            ...toUint256WithSpread(args.amountIn),
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
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Swap ${ctx.call.name} failed:`, error);
      ctx.emit("swapError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "addLiquidity",
    description: "Adds liquidity to an AMM pool by depositing a pair of tokens with optimal ratios calculated automatically.",
    instructions: "Use this action when an agent wants to provide liquidity to a trading pair. The system calculates the optimal token amounts and handles all approvals.",
    schema: z.object({
      tokenA: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("First token contract address in the liquidity pair (must be a valid hex address starting with 0x)"),
      tokenB: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Second token contract address in the liquidity pair (must be a valid hex address starting with 0x)"),
      amountADesired: z.string().describe("Desired amount of first token to contribute as a string in base units (e.g., '1000000000000000000' for 1 token with 18 decimals)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const routerAddress = getContractAddress('core', 'router');
        const agentAddress = await getAgentAddress();
        const optimalAmounts = await calculateOptimalLiquidity({
            contractAddress: routerAddress,
            tokenA: args.tokenA,
            tokenB: args.tokenB,
            amountA: args.amountADesired
        });
      
        const amountA = optimalAmounts.amountA;
        const amountB = optimalAmounts.amountB;
        const balanceA = await getTokenBalance(args.tokenA, agentAddress);
        const balanceB = await getTokenBalance(args.tokenB, agentAddress);
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
          args.tokenA,
          routerAddress,
          amountA
        );
        const approveCallB = getApproveCall(
          args.tokenB,
          routerAddress,
          amountB
        );
        // Create add liquidity args
        const addLiquidityCall = {
          contractAddress: routerAddress,
          entrypoint: "add_liquidity",
          calldata: [
            args.tokenA,
            args.tokenB,
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
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Add liquidity failed:`, error);
      ctx.emit("addLiquidityError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "removeLiquidity",
    description: "Removes liquidity from an AMM pool by burning LP tokens and withdrawing the underlying assets.",
    instructions: "Use this action when an agent needs to withdraw their liquidity from a pool to get back both tokens.",
    schema: z.object({
      tokenA: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("First token contract address to receive back (must be a valid hex address starting with 0x)"),
      tokenB: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("Second token contract address to receive back (must be a valid hex address starting with 0x)"),
      liquidity: z.string().describe("Amount of LP tokens to burn as a string in base units (e.g., '1000000000000000000' for 1 LP token with 18 decimals)"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const routerAddress = getContractAddress('core', 'router');
        const agentAddress = await getAgentAddress();

        const pairAddress = toHex(await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "get_pair_address",
          calldata: [args.tokenA, args.tokenB]
        }));
        // Create approve args for LP token
        const approveCall = getApproveCall(
          pairAddress,
          routerAddress,
          args.liquidity
        );

        // Create remove liquidity args
        const removeLiquidityCall = {
          contractAddress: routerAddress,
          entrypoint: "remove_liquidity",
          calldata: [
            args.tokenA,
            args.tokenB,
            ...toUint256WithSpread(args.liquidity),
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
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Remove liquidity failed:`, error);
      ctx.emit("removeLiquidityError", { action: ctx.call.name, error: error.message });
    },
  }),
]; 
