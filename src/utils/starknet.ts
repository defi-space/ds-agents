/**
 * Starknet Utility Functions
 * This file contains utility functions for interacting with the Starknet blockchain,
 * including configuration management, value conversion, and common contract operations.
 */

import { StarknetChain } from "@daydreamsai/defai";
import { uint256, cairo, type Call } from "starknet";
import { StarknetConfigStore } from "../agents/utils";

// Global variable to track the current agent's ID
let currentAgentId: string | null = null;

/**
 * Sets the current agent ID for Starknet operations
 * @param agentId - The ID of the agent to set as current
 */
export function setCurrentAgentId(agentId: string) {
  currentAgentId = agentId;
}

/**
 * Gets the current agent ID, returns a default if none is set
 * @returns The current agent ID or 'default-agent' as fallback
 */
export function getCurrentAgentId(): string {
  if (!currentAgentId) {
    console.warn(
      "Warning: No agent ID set. Using 'default-agent' as fallback. This should only happen during initialization."
    );
    return "default-agent";
  }
  return currentAgentId;
}

/**
 * Retrieves Starknet configuration for the current agent
 * First tries to get agent-specific config, then falls back to environment variables
 * @returns Configuration object with RPC URL and credentials
 */
const getStarknetConfig = () => {
  // Try to get agent-specific configuration first
  if (currentAgentId) {
    const agentConfig = StarknetConfigStore.getInstance().getConfig(currentAgentId);
    if (agentConfig) {
      return agentConfig;
    }
  }

  // Fall back to environment variables
  const required = {
    STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\nPlease ensure these are set in your .env file`
    );
  }

  // If we have a current agent ID but no configuration for it, this is an error
  if (currentAgentId) {
    throw new Error(
      `No configuration found for agent ID: ${currentAgentId}.\nPlease ensure you have set up the agent's configuration in your .env file.`
    );
  }

  // If no agent ID is set, this is likely during initialization
  // Return a minimal configuration with just the RPC URL
  console.warn(
    "Warning: No agent ID set. Using minimal configuration with only RPC URL.\n" +
      "This is expected during initialization but should not occur during normal operation."
  );

  return {
    rpcUrl: required.STARKNET_RPC_URL || "",
    // These will be overridden once the agent ID is set
    address: "0x0",
    privateKey: "0x0",
  };
};

/**
 * Creates and returns a StarknetChain instance for the current agent
 * @returns Configured StarknetChain instance
 */
export const getStarknetChain = () => {
  const config = getStarknetConfig();
  return new StarknetChain({
    rpcUrl: config.rpcUrl,
    address: config.address,
    privateKey: config.privateKey,
  });
};

/**
 * Creates an ERC20 token approval call
 * @param tokenAddress - Address of the token contract
 * @param spenderAddress - Address of the spender
 * @param amount - Amount to approve
 * @returns Call object for token approval
 */
export const getApproveCall = (
  tokenAddress: string,
  spenderAddress: string,
  amount: string
): Call => {
  const amountU256 = cairo.uint256(amount);
  return {
    contractAddress: tokenAddress,
    entrypoint: "approve",
    calldata: [spenderAddress, amountU256.low, amountU256.high],
  };
};

/**
 * Executes multiple contract calls in a single transaction
 * @param calls - Array of Call objects to execute
 * @returns Transaction result
 */
export const executeMultiCall = async (calls: Call[]) => {
  try {
    // Execute multicall
    const result = await getStarknetChain().writeMulticall(calls);

    return result;
  } catch (error) {
    console.error("Multicall execution failed:", error);
    throw error;
  }
};

/**
 * Converts a value to Cairo uint256 format and returns low and high parts
 * @param value - Value to convert
 * @returns Tuple of [low, high] parts of uint256
 */
export const toUint256WithSpread = (value: string): [string, string] => {
  const uint = cairo.uint256(value);
  return [uint.low.toString(), uint.high.toString()];
};

/**
 * Converts a Cairo uint256 to decimal format
 * @param low - Low part of uint256
 * @param high - High part of uint256
 * @returns Decimal value as BigInt
 */
export const convertU256ToDecimal = (low: string, high: string) => {
  try {
    const u256Value = uint256.uint256ToBN({
      low,
      high,
    });

    return u256Value;
  } catch (error) {
    throw new Error(`Failed to convert u256 to decimal: ${error}`);
  }
};

/**
 * Converts a BigInt value to hexadecimal format
 * @param value - BigInt value or string to convert
 * @param _withPrefix - Whether to include '0x' prefix
 * @returns Hexadecimal string
 */
export const toHex = (value: bigint | string, _withPrefix = true): string => {
  try {
    const bigIntValue = typeof value === "string" ? BigInt(value) : value;
    const hexString = bigIntValue.toString(16);

    return hexString;
  } catch (error) {
    throw new Error(`Failed to convert value to hex: ${error}`);
  }
};

/**
 * Calculates optimal liquidity amounts for Uniswap-style pools
 * Uses constant product formula (x * y = k)
 * @param params - Pool parameters including token addresses and amounts
 * @returns Optimal amounts for both tokens and first provision status
 */
export const calculateOptimalLiquidity = async (params: {
  contractAddress: string;
  tokenA: string;
  tokenB: string;
  amountA?: string;
  amountB?: string;
}) => {
  if (!params.amountA && !params.amountB) {
    throw new Error("Must provide either amountA or amountB");
  }
  if (params.amountA && params.amountB) {
    throw new Error("Provide only one amount, either amountA or amountB");
  }

  const chain = getStarknetChain();

  // Get factory address
  const factoryAddress = toHex(
    await chain.read({
      contractAddress: params.contractAddress,
      entrypoint: "factory",
      calldata: [],
    })
  );

  if (!factoryAddress || factoryAddress === "0x0") {
    throw new Error("Factory address not found");
  }

  // Get pair address
  const pairAddress = toHex(
    await chain.read({
      contractAddress: factoryAddress,
      entrypoint: "get_pair",
      calldata: [params.tokenA, params.tokenB],
    })
  );

  // If pair doesn't exist, we can't calculate optimal amounts
  if (!pairAddress || pairAddress === "0x0") {
    throw new Error("Pool does not exist. Please check context to get all available pairs.");
  }

  // Get current reserves
  const reserves = await chain.read({
    contractAddress: pairAddress,
    entrypoint: "get_reserves",
    calldata: [],
  });

  // Parse reserves - first reserve is [0] and [1], second reserve is [2] and [3]
  const reserveABigInt = convertU256ToDecimal(reserves[0], reserves[1]);
  const reserveBBigInt = convertU256ToDecimal(reserves[2], reserves[3]);

  let amountA: bigint;
  let amountB: bigint;

  if (params.amountA) {
    if (reserveABigInt === 0n || reserveBBigInt === 0n) {
      throw new Error("Pool does not exist. Please check context to get all available pairs.");
    }
    amountA = BigInt(params.amountA);
    // Calculate amountBOptimal using quote function
    const amountBOptimal = (amountA * reserveBBigInt) / reserveABigInt;
    amountB = amountBOptimal;
  } else {
    // Convert amount B to contract value with decimals
    amountB = BigInt(params.amountB || "0");

    if (reserveABigInt === 0n || reserveBBigInt === 0n) {
      throw new Error("Pool does not exist. Please check context to get all available pairs.");
    }

    // Calculate amountAOptimal using quote function
    amountA = (amountB * reserveABigInt) / reserveBBigInt;
  }

  return {
    amountA: amountA.toString(),
    amountB: amountB.toString(),
    isFirstProvision: reserveABigInt === 0n && reserveBBigInt === 0n,
  };
};

/**
 * Retrieves token balance for a given address
 * @param contractAddress - Token contract address
 * @param playerAddress - Address to check balance for
 * @returns Balance as BigInt
 */
export const getTokenBalance = async (contractAddress: string, playerAddress: string) => {
  const chain = getStarknetChain();
  const result = await chain.read({
    contractAddress,
    entrypoint: "balanceOf",
    calldata: [playerAddress],
  });
  return convertU256ToDecimal(result[0], result[1]);
};

/**
 * Formats a raw token balance to human-readable format
 * Assumes 18 decimal places
 * @param rawBalance - Raw balance as BigInt
 * @returns Formatted balance string
 */
export const formatTokenBalance = (rawBalance: bigint) => {
  return (Number(rawBalance) / 10 ** 18).toString();
};

/**
 * Converts a decimal amount to contract value with specified decimals
 * @param amount - Amount as a decimal string
 * @param decimals - Number of decimal places
 * @returns Contract value as string
 */
export const convertToContractValue = (amount: string, decimals: number): string => {
  return BigInt(Math.floor(Number(amount) * 10 ** decimals)).toString();
};
