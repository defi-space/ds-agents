import { StarknetChain } from "@daydreamsai/core";
import { uint256, cairo, type Call } from "starknet";
import { StarknetConfigStore } from "../agents/common";
import { getContractAddress } from "./contracts";

// Create a function to get the current agent ID
// This will be set by the agent when it starts
let currentAgentId: string | null = null;

export function setCurrentAgentId(agentId: string) {
  currentAgentId = agentId;
}

export function getCurrentAgentId(): string {
  if (!currentAgentId) {
    console.warn("Warning: No agent ID set. Using 'default-agent' as fallback. This should only happen during initialization.");
    return "default-agent";
  }
  return currentAgentId;
}
/**
 * Get the agent's address
 * @returns The agent's address
 */
export async function getAgentAddress(): Promise<string> {
  try {
      const agentId = getCurrentAgentId();
      return getContractAddress('agents', agentId);
  } catch (error) {
      console.warn("Warning: Could not get agent address. Using placeholder until agent ID is set.");
      return "[Agent address will be set when agent starts]";
  }
}


// Function to get Starknet configuration for the current agent
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
      `Missing required environment variables: ${missing.join(", ")}\n` +
      `Please ensure these are set in your .env file`
    );
  }

  // If we have a current agent ID but no configuration for it, this is an error
  if (currentAgentId) {
    throw new Error(
      `No configuration found for agent ID: ${currentAgentId}.\n` +
      `Please ensure you have set up the agent's configuration in your .env file.`
    );
  }

  // If no agent ID is set, this is likely during initialization
  // Return a minimal configuration with just the RPC URL
  console.warn(
    "Warning: No agent ID set. Using minimal configuration with only RPC URL.\n" +
    "This is expected during initialization but should not occur during normal operation."
  );
  
  return {
    rpcUrl: required.STARKNET_RPC_URL!,
    // These will be overridden once the agent ID is set
    address: "0x0",
    privateKey: "0x0",
  };
};

// Create a function to get a Starknet chain instance for the current agent
export const getStarknetChain = () => {
  const config = getStarknetConfig();
  return new StarknetChain({
    rpcUrl: config.rpcUrl,
    address: config.address,
    privateKey: config.privateKey,
  });
};

// For backward compatibility - lazy initialization to avoid errors at module load time
let _starknetChain: StarknetChain | null = null;
export const starknetChain = {
  read: async (params: any) => {
    if (!_starknetChain) {
      _starknetChain = getStarknetChain();
    }
    return _starknetChain.read(params);
  },
  write: async (params: any) => {
    if (!_starknetChain) {
      _starknetChain = getStarknetChain();
    }
    return _starknetChain.write(params);
  },
  executeMulticall: async (calls: Call[]) => {
    if (!_starknetChain) {
      _starknetChain = getStarknetChain();
    }
    return _starknetChain.executeMulticall(calls);
  }
};

// Contract value conversion utilities
export const convertToContractValue = (amount: string, decimals: number): string => {
  return BigInt(Math.floor(Number(amount) * 10 ** decimals)).toString();
};

// Token approval utility
export const getApproveCall = (tokenAddress: string, spenderAddress: string, amount: string): Call => {
  const amountU256 = cairo.uint256(amount);
  return {
    contractAddress: tokenAddress,
    entrypoint: 'approve',
    calldata: [spenderAddress, amountU256.low, amountU256.high]
  };
};

// Execute multiple calls in a single transaction
export const executeMultiCall = async (calls: Call[]) => {
  try {
    // Execute multicall
    const result = await getStarknetChain().executeMulticall(calls);

    return result;
  } catch (error) {
    console.error('Multicall execution failed:', error);
    throw error;
  }
};

// Helper function to convert to uint256
export const toUint256WithSpread = (value: string): [string, string] => {
  const uint = cairo.uint256(value);
  return [uint.low.toString(), uint.high.toString()];
};

// Helper function to convert u256 to decimal
export const convertU256ToDecimal = (low: string, high: string) => {
  try {
    const u256Value = uint256.uint256ToBN({
      low,
      high
    });
    
    return u256Value;
  } catch (error) {
    throw new Error(`Failed to convert u256 to decimal: ${error}`);
  }
};

/**
 * Convert a BigInt value to hexadecimal string format
 * @param value BigInt value or string representing a BigInt
 * @param withPrefix Whether to include '0x' prefix (default: true)
 * @returns Hexadecimal string representation
 */
export const toHex = (value: bigint | string, withPrefix: boolean = true): string => {
  try {
    const bigIntValue = typeof value === 'string' ? BigInt(value) : value;
    const hexString = bigIntValue.toString(16);
    
    return hexString;
  } catch (error) {
    throw new Error(`Failed to convert value to hex: ${error}`);
  }
};

/**
 * Calculate optimal liquidity amounts using Uniswap's constant product formula
 * @param params Parameters for calculating optimal liquidity
 * @returns Optimal amounts for both tokens and whether it's first provision
 */
export const calculateOptimalLiquidity = async (params: {
  contractAddress: string,
  tokenA: string,
  tokenB: string,
  amountA?: string,
  amountB?: string
}) => {
  if (!params.amountA && !params.amountB) {
    throw new Error("Must provide either amountA or amountB");
  }
  if (params.amountA && params.amountB) {
    throw new Error("Provide only one amount, either amountA or amountB");
  }

  const chain = getStarknetChain();

  // Get factory address
  const factoryAddress = toHex(await chain.read({
    contractAddress: params.contractAddress,
    entrypoint: "factory",
    calldata: []
  }));
  
  if (!factoryAddress || factoryAddress === "0x0") {
    throw new Error("Factory address not found");
  }

  // Get pair address
  const pairAddress = toHex(await chain.read({
    contractAddress: factoryAddress,
    entrypoint: "get_pair",
    calldata: [params.tokenA, params.tokenB]
  }));

  // If pair doesn't exist, we can't calculate optimal amounts
  if (!pairAddress || pairAddress === "0x0") {
    throw new Error("Pool does not exist. For first liquidity provision, provide both amounts manually.");
  }

  // Get current reserves
  const reserves = await chain.read({
    contractAddress: pairAddress,
    entrypoint: "get_reserves",
    calldata: []
  });

  // Parse reserves - first reserve is [0] and [1], second reserve is [2] and [3]
  const reserveABigInt = convertU256ToDecimal(reserves[0], reserves[1]);
  const reserveBBigInt = convertU256ToDecimal(reserves[2], reserves[3]);

  let amountA: bigint;
  let amountB: bigint;

  if (params.amountA) {    
    if (reserveABigInt === 0n || reserveBBigInt === 0n) {
      throw new Error("Pool does not exist. For first liquidity provision, provide both amounts manually.");
    }
    amountA = BigInt(params.amountA);
    // Calculate amountBOptimal using quote function
    const amountBOptimal = (amountA * reserveBBigInt) / reserveABigInt;
    amountB = amountBOptimal;
    
  } else {
    // Convert amount B to contract value with decimals
    amountB = BigInt(params.amountB!);
    
    if (reserveABigInt === 0n || reserveBBigInt === 0n) {
      throw new Error("Pool does not exist. For first liquidity provision, provide both amounts manually.");
    }
    
    // Calculate amountAOptimal using quote function
    amountA = (amountB * reserveABigInt) / reserveBBigInt;
  }

  return {
    amountA: amountA.toString(),
    amountB: amountB.toString(),
    isFirstProvision: reserveABigInt === 0n && reserveBBigInt === 0n
  };
};

/**
 * Removes trailing zeros from a Starknet address and ensures proper hex format
 * @param address The address to normalize
 * @returns Normalized address without trailing zeros
 */
export const normalizeAddress = (address: string): string => {
  // Ensure the address starts with '0x'
  const prefixedAddress = address.startsWith('0x') ? address : `0x${address}`;
  
  // Remove trailing zeros and maintain '0x' prefix
  const normalized = prefixedAddress.toLowerCase().replace(/^0x0*/, '0x');
  
  // If the result is just '0x', return '0x0'
  return normalized === '0x' ? '0x0' : normalized;
};

// Helper function to get balance and convert to decimal
export const getTokenBalance = async (contractAddress: string, playerAddress: string) => {
  const chain = getStarknetChain();
  const result = await chain.read({
    contractAddress,
    entrypoint: 'balanceOf',
    calldata: [playerAddress]
  });
  return convertU256ToDecimal(result[0], result[1]);
};

// Helper function to format token balance
export const formatTokenBalance = (rawBalance: bigint) => ({
  balance: (Number(rawBalance) / Math.pow(10, 18)).toString(),
  tokenBaseUnitBalance: rawBalance.toString()
});