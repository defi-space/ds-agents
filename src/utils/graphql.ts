import { GraphQLClient } from "graphql-request";
import { getCoreAddress, getFarmAddress } from "./contracts";
import { GET_FARM_INDEX_BY_ADDRESS, GET_GAME_SESSION_INDEX_BY_ADDRESS } from "./queries";

// Ensure INDEXER_URL is set
const INDEXER_URL = process.env.INDEXER_URL as string;
if (!INDEXER_URL) {
  throw new Error("INDEXER_URL is not set");
}

// Initialize GraphQL client
const graphqlClient = new GraphQLClient(INDEXER_URL, {
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/**
 * Execute a GraphQL query against the indexer
 * @param query The GraphQL query string
 * @param variables Optional variables for the query
 * @returns The query result or throws an error
 */
export async function executeQuery<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    return await graphqlClient.request<T>(query, variables);
  } catch (error) {
    console.error("GraphQL query failed:", error);
    throw error;
  }
}

/**
 * Normalizes a Starknet address by removing leading zeros and ensuring proper format
 * @param address - The address to normalize
 * @returns Normalized address string
 */
export const normalizeAddress = (address: string): string => {
  // Ensure the address starts with '0x'
  const prefixedAddress = address.startsWith("0x") ? address : `0x${address}`;

  // Remove trailing zeros and maintain '0x' prefix
  const normalized = prefixedAddress.toLowerCase().replace(/^0x0*/, "0x");

  // If the result is just '0x', return '0x0'
  return normalized === "0x" ? "0x0" : normalized;
};

export async function getGameSessionId() {
  const sessionAddress = getCoreAddress("gameSession");
  if (!sessionAddress) {
    throw new Error("Failed to get game session address");
  }

  const normalizedAddress = normalizeAddress(sessionAddress);

  const result = await executeQuery(GET_GAME_SESSION_INDEX_BY_ADDRESS, {
    address: normalizedAddress,
  });

  if (
    !result?.gameSession?.[0] ||
    result.gameSession[0].gameSessionIndex === undefined ||
    result.gameSession[0].gameSessionIndex === null
  ) {
    throw new Error(`No game session index found for address ${sessionAddress}`);
  }
  return result.gameSession[0].gameSessionIndex;
}

export async function getFarmIndex(tokenA: string, tokenB?: string) {
  const farmAddress = getFarmAddress(tokenA, tokenB);
  const normalizedAddress = normalizeAddress(farmAddress);
  const gameSessionId = await getGameSessionId();

  const result = await executeQuery(GET_FARM_INDEX_BY_ADDRESS, {
    address: normalizedAddress,
    gameSessionId: gameSessionId,
  });

  if (
    !result?.farm?.[0] ||
    result.farm[0].farmIndex === undefined ||
    result.farm[0].farmIndex === null
  ) {
    throw new Error(`No farm index found for address ${farmAddress}`);
  }
  return result.farm[0].farmIndex;
}
