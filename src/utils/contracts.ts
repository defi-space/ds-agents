import contractAddresses from "../../contracts.json";
import { getCurrentAgentId } from "./starknet";

export type ContractCategory = "core" | "resources" | "pairs" | "farms" | "agents";

export const availableTokenSymbols = ["wD", "Nd", "Dy", "Y", "C", "GRP", "GPH", "He3"] as const;

export type TokenSymbol = (typeof availableTokenSymbols)[number];

/**
 * Get a trading pair address by token symbols
 * @param tokenA First token symbol
 * @param tokenB Second token symbol
 * @returns The pair contract address
 */
export function getPairAddress(tokenA: string, tokenB: string): string {
  // Try both combinations since pairs can be listed as A/B or B/A
  const pairKey1 = `${tokenA}/${tokenB}`;
  const pairKey2 = `${tokenB}/${tokenA}`;

  const pairs = contractAddresses.pairs as Record<string, string>;

  const address = pairs[pairKey1] || pairs[pairKey2];

  if (!address) {
    throw new Error(`Pair ${tokenA}/${tokenB} not found`);
  }

  return address;
}

/**
 * Get a farm address by LP token symbols
 * @param tokenA First token symbol of the LP pair
 * @param tokenB Second token symbol of the LP pair (optional for single token farms)
 * @returns The farm contract address
 */
export function getFarmAddress(tokenA: string, tokenB?: string): string {
  const farms = contractAddresses.farms as Record<string, string>;

  if (!tokenB) {
    // Single token farm
    const address = farms[tokenA];
    if (!address) {
      throw new Error(`Single token farm ${tokenA} not found`);
    }
    return address;
  }

  // LP token farm - try both combinations
  const farmKey1 = `${tokenA}/${tokenB}`;
  const farmKey2 = `${tokenB}/${tokenA}`;

  const address = farms[farmKey1] || farms[farmKey2];

  if (!address) {
    throw new Error(`Farm ${tokenA}/${tokenB} not found`);
  }

  return address;
}

/**
 * Get an agent address by agent identifier
 * @param agentId The agent identifier (e.g., "agent-1", "agent-2")
 * @returns The agent contract address
 */
export function getAgentAddress(agentId?: string): string {
  const agents = contractAddresses.agents as Record<string, string>;

  if (!agentId) {
    // If no agent ID provided, return the current agent's address
    const currentId = getCurrentAgentId();
    const address = agents[currentId];
    if (!address) {
      throw new Error(`Current agent ${currentId} not found`);
    }
    return address;
  }

  const address = agents[agentId];
  if (!address) {
    throw new Error(`Agent ${agentId} not found`);
  }

  return address;
}

/**
 * Get a resource token address by symbol
 * @param symbol The token symbol (e.g., "wD", "GRP", "He3")
 * @returns The token contract address
 */
export function getResourceAddress(symbol: TokenSymbol): string {
  const resources = contractAddresses.resources as Record<string, string>;

  const address = resources[symbol];
  if (!address) {
    throw new Error(`Resource token ${symbol} not found`);
  }

  return address;
}

/**
 * Get a core contract address by name
 * @param contractName The core contract name (e.g., "ammRouter", "farmRouter", "faucet", "gameSession")
 * @returns The contract address
 */
export function getCoreAddress(contractName: string): string {
  const core = contractAddresses.core as Record<string, string>;

  const address = core[contractName];
  if (!address) {
    throw new Error(`Core contract ${contractName} not found`);
  }

  return address;
}

/**
 * Get all available pairs
 * @returns Array of pair identifiers
 */
export function getAvailablePairs(): string[] {
  return Object.keys(contractAddresses.pairs);
}

/**
 * Get all available farms
 * @returns Array of farm identifiers
 */
export function getAvailableFarms(): string[] {
  return Object.keys(contractAddresses.farms);
}

/**
 * Get all available agents
 * @returns Array of agent identifiers
 */
export function getAvailableAgents(): string[] {
  return Object.keys(contractAddresses.agents);
}

/**
 * Get all contract addresses (for debugging/inspection)
 * @returns The complete contract addresses object
 */
export function getAllContractAddresses() {
  return contractAddresses;
}
