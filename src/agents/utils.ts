import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Represents the configuration for a Starknet connection
 */
export interface StarknetConfig {
  rpcUrl: string;
  address: string;
  privateKey: string;
}

/**
 * A singleton store for Starknet configuration by agent ID
 */
export class StarknetConfigStore {
  private static instance: StarknetConfigStore;
  private configs: Map<string, StarknetConfig> = new Map();

  private constructor() {}

  public static getInstance(): StarknetConfigStore {
    if (!StarknetConfigStore.instance) {
      StarknetConfigStore.instance = new StarknetConfigStore();
    }
    return StarknetConfigStore.instance;
  }

  public setConfig(agentId: string, config: StarknetConfig): void {
    this.configs.set(agentId, config);
  }

  public getConfig(agentId: string): StarknetConfig | undefined {
    return this.configs.get(agentId);
  }
}

/**
 * Validates if an agent number is within the acceptable range
 * @param agentNumber The agent number to validate
 * @throws Error if agent number is invalid
 */
export function validateAgentNumber(agentNumber: number): void {
  if (agentNumber < 1 || agentNumber > 4) {
    throw new Error(`Invalid agent number: ${agentNumber}. Must be between 1 and 4.`);
  }
}

/**
 * Gets the agent ID from environment variable or agent number
 * @param agentNumber The agent number
 * @returns The agent ID string
 */
export function getAgentId(agentNumber: number): string {
  return process.env.CURRENT_AGENT_ID || `agent-${agentNumber}`;
}

/**
 * Gets the command line arguments
 * @returns Array of command line arguments
 */
export function getCommandLineArgs(): string[] {
  return process.argv.slice(2);
}

/**
 * Checks if the agent is running in manual mode
 * @returns Boolean indicating if manual mode is enabled
 */
export function isManualMode(): boolean {
  return getCommandLineArgs().includes('--manual');
}

/**
 * Gets the Google API key for a specific agent
 * @param agentId The agent ID
 * @param agentNumber The agent number
 * @returns The Google API key
 * @throws Error if no API key is found
 */
export function getGoogleApiKey(agentId: string, agentNumber: number): string {
  const apiKeyEnvVar = `AGENT${agentNumber}_API_KEY`;
  
  // Get API key and remove quotes if present
  let apiKey = process.env[apiKeyEnvVar];
  if (apiKey) {
    apiKey = apiKey.replace(/^["'](.*)["']$/, '$1').trim();
  } else {
    // Fall back to default key
    apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      apiKey = apiKey.replace(/^["'](.*)["']$/, '$1').trim();
    }
  }
  
  if (!apiKey) {
    throw new Error(`No Google API key found for agent ${agentId}`);
  }
  
  return apiKey;
}

/**
 * Checks if the agent is running in a Phala TEE environment
 * @returns Boolean indicating if in Phala TEE
 */
export function isPhalaEnvironment(): boolean {
  return process.env.PHALA_TEE === 'true';
}

/**
 * Gets the Phala worker ID if in Phala environment
 * @returns The Phala worker ID or undefined
 */
export function getPhalaWorkerId(): string | undefined {
  return process.env.PHALA_WORKER_ID;
}

/**
 * Gets the ChromaDB URL from environment variables or falls back to the default container
 * @returns The ChromaDB URL
 */
export function getChromaDbUrl(): string {
  // Check if we're running locally (not in Docker)
  const isLocalDev = !process.env.HOSTNAME?.includes('container') && !isPhalaEnvironment();
  
  let chromaHost;
  
  if (isLocalDev) {
    // When running locally outside Docker, we need to use localhost
    chromaHost = process.env.CHROMA_HOST || "localhost";
  } else {
    // For Phala TEE or Docker environment
    const defaultPrefix = isPhalaEnvironment() ? "defi-space-agents" : (process.env.COMPOSE_PROJECT_NAME || "daydreams");
    chromaHost = process.env.CHROMA_HOST || `${defaultPrefix}_chroma`;
  }
  
  const chromaPort = process.env.CHROMA_PORT || "8000";
  
  return `http://${chromaHost}:${chromaPort}`;
}

/**
 * Gets the MongoDB connection URL from Atlas URI
 * @returns The MongoDB connection URL
 */
export function getMongoDbUrl(): string {
  if (process.env.MONGODB_ATLAS_URI) {
    return process.env.MONGODB_ATLAS_URI;
  }
  
  throw new Error('MongoDB Atlas URI not found in environment variables. Set MONGODB_ATLAS_URI.');
}

/**
 * Gets the Starknet configuration for a specific agent
 * @param agentNumber The agent number
 * @returns Starknet configuration object
 */
export function getStarknetConfig(agentNumber: number): StarknetConfig {
  return {
    rpcUrl: process.env.STARKNET_RPC_URL!,
    address: process.env[`AGENT${agentNumber}_ADDRESS`]!,
    privateKey: process.env[`AGENT${agentNumber}_PRIVATE_KEY`]!,
  };
} 