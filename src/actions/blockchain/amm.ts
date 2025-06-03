import { action, z } from "@daydreamsai/core";
import {
  convertU256ToDecimal,
  formatTokenBalance,
  getTokenBalance,
  getStarknetChain,
  toHex,
  toUint256WithSpread,
  calculateOptimalLiquidity,
  convertToContractValue,
  executeMultiCall,
  getApproveCall,
} from "../../utils/starknet";
import {
  getCoreAddress,
  getResourceAddress,
  availableTokenSymbols,
  getAgentAddress,
} from "../../utils/contracts";

export const ammActions = [
  // Router Operations - Price Calculations
  action({
    name: "getAmountOut",
    description: "Calculates the exact output amount for a token swap given an input amount.",
    instructions: `Use this action when you need to know how much of a token you will receive for a specific amount of another token.`,
    schema: z.object({
      tokenIn: z
        .enum(availableTokenSymbols)
        .describe(
          `Token symbol to swap from. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
      tokenOut: z
        .enum(availableTokenSymbols)
        .describe(`Token symbol to receive. Available tokens: ${availableTokenSymbols.join(", ")}`),
      amountIn: z.string().describe("Amount of input tokens in a human readable format."),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        // Input validation
        if (args.tokenIn === args.tokenOut) {
          return {
            success: false,
            message: "Cannot calculate amount out: input and output tokens are the same",
            timestamp: Date.now(),
          };
        }

        // Get token addresses
        const tokenInAddress = getResourceAddress(args.tokenIn);
        if (!tokenInAddress) {
          return {
            success: false,
            message: `Cannot calculate amount out: token ${args.tokenIn} not found`,
            timestamp: Date.now(),
          };
        }
        const tokenOutAddress = getResourceAddress(args.tokenOut);
        if (!tokenOutAddress) {
          return {
            success: false,
            message: `Cannot calculate amount out: token ${args.tokenOut} not found`,
            timestamp: Date.now(),
          };
        }
        const amountIn = convertToContractValue(args.amountIn, 18);

        // Get contract addresses
        const routerAddress = getCoreAddress("ammRouter");
        if (!routerAddress) {
          return {
            success: false,
            message: "Cannot calculate amount out: router contract address not found",
            timestamp: Date.now(),
          };
        }
        const starknetChain = getStarknetChain();
        // Get factory address
        const factoryAddress = toHex(
          await starknetChain.read({
            contractAddress: routerAddress,
            entrypoint: "factory",
            calldata: [],
          })
        );

        // Get pair address
        const pairAddress = toHex(
          await starknetChain.read({
            contractAddress: factoryAddress,
            entrypoint: "get_pair",
            calldata: [tokenInAddress, tokenOutAddress],
          })
        );

        // Check if pair exists
        if (pairAddress === "0x0" || pairAddress === "0x00") {
          return {
            success: false,
            message: `Cannot calculate amount out: no liquidity pair exists for ${args.tokenIn} and ${args.tokenOut}. Please check context to get available pairs.`,
            timestamp: Date.now(),
          };
        }

        // Get reserves
        const reserves = await starknetChain.read({
          contractAddress: pairAddress,
          entrypoint: "get_reserves",
          calldata: [],
        });

        const reserveIn = convertU256ToDecimal(reserves[0], reserves[1]);
        const reserveOut = convertU256ToDecimal(reserves[2], reserves[3]);

        // Check if reserves are sufficient
        if (reserveIn.toString() === "0" || reserveOut.toString() === "0") {
          return {
            success: false,
            message: "Cannot calculate amount out: insufficient liquidity in the pool",
            timestamp: Date.now(),
          };
        }

        // Calculate amount out
        const result = await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "get_amount_out",
          calldata: [
            ...toUint256WithSpread(amountIn),
            ...toUint256WithSpread(reserveIn.toString()),
            ...toUint256WithSpread(reserveOut.toString()),
          ],
        });

        // Convert to human readable format
        const amountOut = convertU256ToDecimal(result[0], result[1]);
        const formattedAmountOut = formatTokenBalance(amountOut);

        return {
          success: true,
          message: `For ${args.amountIn} of ${args.tokenIn}, you will receive approximately ${formattedAmountOut} of ${args.tokenOut}`,
          data: {
            amountOut: formattedAmountOut,
            tokenInAddress,
            tokenOutAddress,
            reserveIn: formatTokenBalance(reserveIn),
            reserveOut: formatTokenBalance(reserveOut),
            pairAddress,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to get amount out:", error);
        return {
          success: false,
          message: `Failed to calculate swap output amount: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error(`Action ${ctx.call.name} failed:`, error);
      ctx.emit("actionError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "quote",
    description: "Provides a quote for swapping tokens based on current pool reserves.",
    instructions: `Use this action when you need a simple quote for token swap.`,
    schema: z.object({
      tokenIn: z
        .enum(availableTokenSymbols)
        .describe(`Token name to swap from. Available tokens: ${availableTokenSymbols.join(", ")}`),
      tokenOut: z
        .enum(availableTokenSymbols)
        .describe(`Token name to receive. Available tokens: ${availableTokenSymbols.join(", ")}`),
      amountIn: z.string().describe("Amount of input tokens in a human readable format."),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        // Input validation
        if (args.tokenIn === args.tokenOut) {
          return {
            success: false,
            message: "Cannot calculate quote: input and output tokens are the same",
            timestamp: Date.now(),
          };
        }
        // Get token addresses
        const tokenInAddress = getResourceAddress(args.tokenIn);
        if (!tokenInAddress) {
          return {
            success: false,
            message: `Cannot calculate quote: token ${args.tokenIn} not found`,
            timestamp: Date.now(),
          };
        }
        const tokenOutAddress = getResourceAddress(args.tokenOut);
        if (!tokenOutAddress) {
          return {
            success: false,
            message: `Cannot calculate quote: token ${args.tokenOut} not found`,
            timestamp: Date.now(),
          };
        }
        const amountIn = convertToContractValue(args.amountIn, 18);

        // Get Router Address
        const routerAddress = getCoreAddress("ammRouter");
        if (!routerAddress) {
          return {
            success: false,
            message: "Cannot calculate quote: router contract address not found",
            timestamp: Date.now(),
          };
        }
        const starknetChain = getStarknetChain();
        // Get Factory Address
        const factoryAddress = toHex(
          await starknetChain.read({
            contractAddress: routerAddress,
            entrypoint: "factory",
            calldata: [],
          })
        );

        // Get Pair Address
        const pairAddress = toHex(
          await starknetChain.read({
            contractAddress: factoryAddress,
            entrypoint: "get_pair",
            calldata: [tokenInAddress, tokenOutAddress],
          })
        );

        // Check if pair exists
        if (pairAddress === "0x0" || pairAddress === "0x00") {
          return {
            success: false,
            message: `Cannot calculate quote: no liquidity pair exists for ${args.tokenIn} and ${args.tokenOut}. Please check context to get available pairs.`,
            timestamp: Date.now(),
          };
        }

        // Get Reserves
        const reserves = await starknetChain.read({
          contractAddress: pairAddress,
          entrypoint: "get_reserves",
          calldata: [],
        });
        const reserveIn = convertU256ToDecimal(reserves[0], reserves[1]);
        const reserveOut = convertU256ToDecimal(reserves[2], reserves[3]);

        // Get Quote
        const result = await starknetChain.read({
          contractAddress: routerAddress,
          entrypoint: "quote",
          calldata: [
            ...toUint256WithSpread(amountIn),
            ...toUint256WithSpread(reserveIn.toString()),
            ...toUint256WithSpread(reserveOut.toString()),
          ],
        });

        // Convert to human readable format
        const amountOut = convertU256ToDecimal(result[0], result[1]);
        const formattedAmountOut = formatTokenBalance(amountOut);

        // Return result
        return {
          success: true,
          message: `For ${args.amountIn} of ${args.tokenIn}, you will receive approximately ${formattedAmountOut} of ${args.tokenOut}`,
          data: {
            amountOut: formattedAmountOut,
            tokenInAddress,
            tokenOutAddress,
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to calculate quote:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to calculate quote",
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error(`Action ${ctx.call.name} failed:`, error);
      ctx.emit("actionError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "swapTokens",
    description: "Executes a token swap",
    instructions: `Use this action when you need to swap a specific amount of one token for another.`,
    schema: z.object({
      tokenIn: z
        .enum(availableTokenSymbols)
        .describe(`Token name to swap from. Available tokens: ${availableTokenSymbols.join(", ")}`),
      tokenOut: z
        .enum(availableTokenSymbols)
        .describe(`Token name to receive. Available tokens: ${availableTokenSymbols.join(", ")}`),
      amountIn: z.string().describe("Amount of input tokens in a human readable format."),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        // Input validation
        if (args.tokenIn === args.tokenOut) {
          return {
            success: false,
            message: "Cannot execute swap: input and output tokens are the same",
            timestamp: Date.now(),
          };
        }

        // Get token addresses
        const tokenInAddress = getResourceAddress(args.tokenIn);
        if (!tokenInAddress) {
          return {
            success: false,
            message: `Cannot execute swap: token ${args.tokenIn} not found`,
            timestamp: Date.now(),
          };
        }
        const tokenOutAddress = getResourceAddress(args.tokenOut);
        if (!tokenOutAddress) {
          return {
            success: false,
            message: `Cannot execute swap: token ${args.tokenOut} not found`,
            timestamp: Date.now(),
          };
        }
        const amountIn = convertToContractValue(args.amountIn, 18);

        // Construct the path array
        const path = [tokenInAddress, tokenOutAddress];
        const routerAddress = getCoreAddress("ammRouter");
        if (!routerAddress) {
          return {
            success: false,
            message: "Cannot execute swap: router contract address not found",
            timestamp: Date.now(),
          };
        }
        const agentAddress = getAgentAddress();

        const starknetChain = getStarknetChain();
        // Get factory address
        const factoryAddress = toHex(
          await starknetChain.read({
            contractAddress: routerAddress,
            entrypoint: "factory",
            calldata: [],
          })
        );

        // Check if pair exists
        const pairAddress = toHex(
          await starknetChain.read({
            contractAddress: factoryAddress,
            entrypoint: "get_pair",
            calldata: [tokenInAddress, tokenOutAddress],
          })
        );

        // Check if pair exists
        if (pairAddress === "0x0" || pairAddress === "0x00") {
          return {
            success: false,
            message: `Cannot execute swap: no liquidity pair exists for ${args.tokenIn} and ${args.tokenOut}. Please check context to get available pairs.`,
            timestamp: Date.now(),
          };
        }

        // Get balance of input token
        const balance = await getTokenBalance(tokenInAddress, agentAddress);
        if (BigInt(amountIn) > balance) {
          return {
            success: false,
            message: `Cannot execute swap: insufficient balance for ${args.tokenIn}. amountIn: ${args.amountIn}, balance: ${formatTokenBalance(balance)}`,
            timestamp: Date.now(),
          };
        }

        // Create approve args for input token
        const approveCall = getApproveCall(tokenInAddress, routerAddress, amountIn);

        // Create swap args
        const swapCall = {
          contractAddress: routerAddress,
          entrypoint: "swap_exact_tokens_for_tokens",
          calldata: [
            ...toUint256WithSpread(amountIn),
            ...toUint256WithSpread("0"),
            path.length.toString(),
            ...path,
            agentAddress,
            Date.now() + 1000 * 60 * 10, // 10 minutes from now
          ],
        };

        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, swapCall]);

        if (result.receipt?.statusReceipt !== "success") {
          return {
            success: false,
            message: result.error || "Transaction failed",
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        // Return result
        return {
          success: true,
          message: `Swap executed successfully: ${args.tokenIn} → ${args.tokenOut}`,
          txHash: result.transactionHash,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to execute swap:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to execute swap",
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error(`Swap ${ctx.call.name} failed:`, error);
      ctx.emit("swapError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "addLiquidity",
    description: "Adds liquidity to a liquidity pool",
    instructions: `Use this action when you want to provide liquidity to a trading token pair.`,
    schema: z.object({
      tokenA: z
        .enum(availableTokenSymbols)
        .describe(
          `First token name in the liquidity pair. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
      tokenB: z
        .enum(availableTokenSymbols)
        .describe(
          `Second token name in the liquidity pair. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
      amountADesired: z
        .string()
        .describe("Desired amount of first token to deposit in the liquidity pool."),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        // Input validation
        if (args.tokenA === args.tokenB) {
          return {
            success: false,
            message: "Cannot add liquidity: input and output tokens are the same",
            timestamp: Date.now(),
          };
        }

        // Get token addresses
        const tokenAAddress = getResourceAddress(args.tokenA);
        if (!tokenAAddress) {
          return {
            success: false,
            message: `Cannot add liquidity: token ${args.tokenA} not found`,
            timestamp: Date.now(),
          };
        }
        const tokenBAddress = getResourceAddress(args.tokenB);
        if (!tokenBAddress) {
          return {
            success: false,
            message: `Cannot add liquidity: token ${args.tokenB} not found`,
            timestamp: Date.now(),
          };
        }
        const amountADesired = convertToContractValue(args.amountADesired, 18);

        // Get router address
        const routerAddress = getCoreAddress("ammRouter");
        if (!routerAddress) {
          return {
            success: false,
            message: "Cannot add liquidity: router contract address not found",
            timestamp: Date.now(),
          };
        }
        const starknetChain = getStarknetChain();

        // Get agent address
        const agentAddress = getAgentAddress();
        // Get factory address
        const factoryAddress = toHex(
          await starknetChain.read({
            contractAddress: routerAddress,
            entrypoint: "factory",
            calldata: [],
          })
        );

        // Check if pair exists
        const pairAddress = toHex(
          await starknetChain.read({
            contractAddress: factoryAddress,
            entrypoint: "get_pair",
            calldata: [tokenAAddress, tokenBAddress],
          })
        );

        // Get optimal amounts
        const optimalAmounts = await calculateOptimalLiquidity({
          contractAddress: routerAddress,
          tokenA: tokenAAddress,
          tokenB: tokenBAddress,
          amountA: amountADesired,
        });

        // Check if pair exists
        if (!optimalAmounts.isFirstProvision && (pairAddress === "0x0" || pairAddress === "0x00")) {
          return {
            success: false,
            message: `Cannot add liquidity: no liquidity pair exists for ${args.tokenA} and ${args.tokenB}. Please check context to get available pairs.`,
            timestamp: Date.now(),
          };
        }

        // Get balances
        const amountA = optimalAmounts.amountA;
        const amountB = optimalAmounts.amountB;
        const balanceA = await getTokenBalance(tokenAAddress, agentAddress);
        const balanceB = await getTokenBalance(tokenBAddress, agentAddress);

        // Check if balances are sufficient
        if (balanceA < BigInt(amountA)) {
          return {
            success: false,
            message: `Insufficient balance for ${args.tokenA}, consider decreasing amountADesired. amountA: ${formatTokenBalance(BigInt(amountA))}, balance: ${formatTokenBalance(balanceA)}`,
            timestamp: Date.now(),
          };
        }
        if (balanceB < BigInt(amountB)) {
          return {
            success: false,
            message: `Insufficient balance for ${args.tokenB}, consider decreasing amountADesired. amountB: ${formatTokenBalance(BigInt(amountB))}, balance: ${formatTokenBalance(balanceB)}`,
            timestamp: Date.now(),
          };
        }
        // Create approve calls for both tokens
        const approveCallA = getApproveCall(tokenAAddress, routerAddress, amountA);
        const approveCallB = getApproveCall(tokenBAddress, routerAddress, amountB);
        // Create add liquidity args
        const addLiquidityCall = {
          contractAddress: routerAddress,
          entrypoint: "add_liquidity",
          calldata: [
            tokenAAddress,
            tokenBAddress,
            ...toUint256WithSpread(amountA),
            ...toUint256WithSpread(amountB),
            ...toUint256WithSpread("0"),
            ...toUint256WithSpread("0"),
            agentAddress,
            Date.now() + 1000 * 60 * 10, // 10 minutes from now
          ],
        };

        // Execute calls using multicall
        const result = await executeMultiCall([approveCallA, approveCallB, addLiquidityCall]);

        if (result.receipt?.statusReceipt !== "success") {
          return {
            success: false,
            message: result.error || "Transaction failed",
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        // Return result
        return {
          success: true,
          message: `Liquidity added successfully for ${args.tokenA}/${args.tokenB} pair`,
          txHash: result.transactionHash,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to add liquidity:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to add liquidity",
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Add liquidity failed:", error);
      ctx.emit("addLiquidityError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "removeLiquidity",
    description: "Removes liquidity from a liquidity pool",
    instructions: `Use this action when you want to withdraw your liquidity from a liquidity pool.`,
    schema: z.object({
      tokenA: z
        .enum(availableTokenSymbols)
        .describe(
          `First token name to receive back. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
      tokenB: z
        .enum(availableTokenSymbols)
        .describe(
          `Second token name to receive back. Available tokens: ${availableTokenSymbols.join(", ")}`
        ),
      liquidity: z.string().describe("Amount of LP tokens to burn, in a human readable format."),
    }),
    handler: async (args, _ctx, _agent) => {
      try {
        // Input validation
        if (args.tokenA === args.tokenB) {
          return {
            success: false,
            message: "Cannot remove liquidity: input and output tokens are the same",
            timestamp: Date.now(),
          };
        }

        // Get token addresses
        const tokenAAddress = getResourceAddress(args.tokenA);
        if (!tokenAAddress) {
          return {
            success: false,
            message: `Cannot remove liquidity: token ${args.tokenA} not found`,
            timestamp: Date.now(),
          };
        }
        const tokenBAddress = getResourceAddress(args.tokenB);
        if (!tokenBAddress) {
          return {
            success: false,
            message: `Cannot remove liquidity: token ${args.tokenB} not found`,
            timestamp: Date.now(),
          };
        }
        const liquidity = convertToContractValue(args.liquidity, 18);
        const routerAddress = getCoreAddress("ammRouter");
        if (!routerAddress) {
          return {
            success: false,
            message: "Cannot remove liquidity: router contract address not found",
            timestamp: Date.now(),
          };
        }
        const starknetChain = getStarknetChain();

        // Get agent address
        const agentAddress = getAgentAddress();

        // Get pair address
        const pairAddress = toHex(
          await starknetChain.read({
            contractAddress: routerAddress,
            entrypoint: "get_pair_address",
            calldata: [tokenAAddress, tokenBAddress],
          })
        );

        // Check if pair exists
        if (pairAddress === "0x0" || pairAddress === "0x00") {
          return {
            success: false,
            message: `Cannot remove liquidity: no liquidity pair exists for ${args.tokenA} and ${args.tokenB}. Please check context to get available pairs.`,
            timestamp: Date.now(),
          };
        }

        // Get balance of LP token
        const balance = await getTokenBalance(pairAddress, agentAddress);
        if (BigInt(liquidity) > balance) {
          return {
            success: false,
            message: `Cannot remove liquidity: insufficient LP token balance for ${args.tokenA}/${args.tokenB} pair. liquidity: ${args.liquidity}, balance: ${balance}`,
            timestamp: Date.now(),
          };
        }

        // Create approve args for LP token
        const approveCall = getApproveCall(pairAddress, routerAddress, args.liquidity);

        // Create remove liquidity args
        const removeLiquidityCall = {
          contractAddress: routerAddress,
          entrypoint: "remove_liquidity",
          calldata: [
            tokenAAddress,
            tokenBAddress,
            ...toUint256WithSpread(args.liquidity),
            ...toUint256WithSpread("0"),
            ...toUint256WithSpread("0"),
            agentAddress,
            Date.now() + 1000 * 60 * 10, // 10 minutes from now
          ],
        };

        // Execute both calls using multicall
        const result = await executeMultiCall([approveCall, removeLiquidityCall]);

        if (result.receipt?.statusReceipt !== "success") {
          return {
            success: false,
            message: result.error || "Transaction failed",
            receipt: result.receipt,
            timestamp: Date.now(),
          };
        }

        // Return result
        return {
          success: true,
          message: `Liquidity removed successfully from ${args.tokenA}/${args.tokenB} pair`,
          txHash: result.transactionHash,
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to remove liquidity:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to remove liquidity",
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Remove liquidity failed:", error);
      ctx.emit("removeLiquidityError", { action: ctx.call.name, error: error.message });
    },
  }),
];
