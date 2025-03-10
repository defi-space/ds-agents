import { GraphQLClient } from 'graphql-request';

// Ensure INDEXER_URL is set
const INDEXER_URL = process.env.INDEXER_URL as string;
if (!INDEXER_URL) {
  throw new Error("INDEXER_URL is not set");
}

// Initialize GraphQL client
const graphqlClient = new GraphQLClient(INDEXER_URL, {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
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
    console.error('GraphQL query failed:', error);
    throw error;
  }
}