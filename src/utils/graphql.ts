import { GraphQLClient } from "graphql-request";
import { getCoreAddress } from "./contracts";
import { normalizeAddress } from "./starknet";
import { GET_GAME_SESSION_INDEX_BY_ADDRESS } from "./queries";

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

export async function getGameSessionId() {
  const sessionAddress = getCoreAddress("gameSession");
  if (!sessionAddress) {
    throw new Error("Failed to get game session address");
  }

  const normalizedAddress = normalizeAddress(sessionAddress);

  const result = await executeQuery(GET_GAME_SESSION_INDEX_BY_ADDRESS, {
    address: normalizedAddress,
  });

  if (!result?.gameSession?.[0]?.gameSessionIndex) {
    throw new Error(`No game session index found for address ${sessionAddress}`);
  }
  return result.gameSession[0].gameSessionIndex;
}
