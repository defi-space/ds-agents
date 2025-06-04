import dotenv from "dotenv";
import { GET_GAME_SESSION_INFO } from "../utils/queries";
import { executeQuery } from "../utils/graphql";
import { getCoreAddress } from "../utils/contracts";

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
  if (Number.isNaN(agentNumber) || agentNumber < 1 || agentNumber > 4) {
    throw new Error(`Invalid agent number: ${agentNumber}. Must be between 1 and 4.`);
  }
}

/**
 * Gets the agent ID from environment variable or agent number
 * @param agentNumber The agent number
 * @returns The agent ID string
 */
export function getAgentId(agentNumber: number): string {
  if (process.env.CURRENT_AGENT_ID) {
    return process.env.CURRENT_AGENT_ID;
  }

  validateAgentNumber(agentNumber);
  return `agent-${agentNumber}`;
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
  return getCommandLineArgs().includes("--manual");
}

/**
 * Gets the Google API key for a specific agent
 * @param agentId The agent ID
 * @param agentNumber The agent number
 * @returns The Google API key
 * @throws Error if no API key is found
 */
export function getGoogleApiKey(agentId: string, agentNumber: number): string {
  // Validate agent number
  validateAgentNumber(agentNumber);

  const apiKeyEnvVar = `AGENT${agentNumber}_API_KEY`;

  // Get API key and remove quotes if present
  let apiKey = process.env[apiKeyEnvVar];
  if (apiKey) {
    apiKey = apiKey.replace(/^["'](.*)["']$/, "$1").trim();
  } else {
    // Fall back to default key
    apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      apiKey = apiKey.replace(/^["'](.*)["']$/, "$1").trim();
    }
  }

  if (!apiKey) {
    throw new Error(
      `No Google API key found for agent ${agentId}. Please set AGENT${agentNumber}_API_KEY or GOOGLE_API_KEY in environment variables.`
    );
  }

  return apiKey;
}

/**
 * Checks if the agent is running in a Phala TEE environment
 * @returns Boolean indicating if in Phala TEE
 */
export function isPhalaEnvironment(): boolean {
  return process.env.PHALA_TEE === "true";
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
  const isLocalDev = !process.env.HOSTNAME?.includes("container") && !isPhalaEnvironment();

  let chromaHost: string;

  if (isLocalDev) {
    // When running locally outside Docker, we need to use localhost or the specified host
    chromaHost = process.env.CHROMA_HOST || "localhost";
  } else {
    // For Phala TEE or Docker environment
    const defaultPrefix = isPhalaEnvironment()
      ? "defi-space-agents"
      : process.env.COMPOSE_PROJECT_NAME || "daydreams";
    chromaHost = process.env.CHROMA_HOST || `${defaultPrefix}_chroma`;
  }

  const chromaPort = process.env.CHROMA_PORT || "8000";

  return `http://${chromaHost}:${chromaPort}`;
}

/**
 * Gets the Starknet configuration for a specific agent
 * @param agentNumber The agent number
 * @returns Starknet configuration object
 * @throws Error if configuration is missing
 */
export function getStarknetConfig(agentNumber: number): StarknetConfig {
  // Validate agent number
  validateAgentNumber(agentNumber);

  const rpcUrl = process.env.STARKNET_RPC_URL;
  const address = process.env[`AGENT${agentNumber}_ADDRESS`];
  const privateKey = process.env[`AGENT${agentNumber}_PRIVATE_KEY`];

  if (!rpcUrl) {
    throw new Error("STARKNET_RPC_URL is not defined in environment variables");
  }

  if (!address) {
    throw new Error(`AGENT${agentNumber}_ADDRESS is not defined in environment variables`);
  }

  if (!privateKey) {
    throw new Error(`AGENT${agentNumber}_PRIVATE_KEY is not defined in environment variables`);
  }

  return { rpcUrl, address, privateKey };
}

/**
 * Generates a collection name in the format:
 * f_{last 5 char of game factory address}_s_{gameSessionId}_a_{agentId}
 *
 * @param agentId The ID of the agent
 * @returns The formatted collection name string
 * @throws Error if unable to fetch game session info
 */
export async function getCollectionName(agentId: string): Promise<string> {
  try {
    // Get the current game session address from contracts
    const gameSessionAddress = getCoreAddress("gameSession");

    // Query for game session info using the executeQuery pattern
    const result = await executeQuery(GET_GAME_SESSION_INFO, {
      address: gameSessionAddress,
    });

    // Extract the required information
    if (!result?.gameSession?.[0]) {
      throw new Error(`No game session found for address ${gameSessionAddress}`);
    }

    const sessionInfo = result.gameSession[0];
    const gameFactory = sessionInfo.gameFactory;
    const gameSessionIndex = sessionInfo.gameSessionIndex;

    // Extract the last 5 characters of the factory address
    const factoryShort = gameFactory.slice(-5);

    // Extract just the number from agentId (e.g., "agent-2" → "2")
    const agentNumber = agentId.charAt(agentId.length - 1);

    // Format the collection name
    return `f_${factoryShort}_s_${gameSessionIndex}_a_${agentNumber}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get collection name: ${errorMessage}`);
  }
}

/**
 * Gets the Supabase configuration from environment variables
 * @returns Supabase configuration object
 * @throws Error if required config is missing
 */
export function getFirebaseConfig() {
  const projectId = process.env.FB_PROJECT_ID;
  const clientEmail = process.env.FB_CLIENT_EMAIL;
  const privateKey = process.env.FB_PRIVATE_KEY || "";

  if (!projectId) {
    throw new Error("FB_PROJECT_ID must be provided in environment variables");
  }

  if (!clientEmail) {
    throw new Error("FB_CLIENT_EMAIL must be provided in environment variables");
  }

  if (!privateKey) {
    throw new Error("FB_PRIVATE_KEY must be provided in environment variables");
  }

  // Decode the Base64 encoded key and properly format it
  let decodedKey: string;
  try {
    // Use Buffer to decode base64 (more reliable than atob)
    decodedKey = Buffer.from(privateKey, "base64").toString();

    // Handle newline characters correctly
    decodedKey = decodedKey.replace(/\\n/g, "\n");
  } catch (error) {
    console.error("Error decoding private key:", error);
    throw new Error("Failed to decode FB_PRIVATE_KEY. Make sure it is properly base64 encoded.");
  }

  return {
    projectId,
    clientEmail,
    privateKey: decodedKey,
  };
}
