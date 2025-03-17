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
  if (agentNumber < 1 || agentNumber > 7) {
    throw new Error(`Invalid agent number: ${agentNumber}. Must be between 1 and 7.`);
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
 * Checks if dashboard integration is enabled
 * @returns Boolean indicating if dashboard is enabled
 */
export function isDashboardEnabled(): boolean {
  // Dashboard is disabled if explicitly set to 'false' or if DASHBOARD_URL is not set
  if (process.env.ENABLE_DASHBOARD === 'false') {
    return false;
  }
  
  // Check if DASHBOARD_URL is set
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (!dashboardUrl || dashboardUrl.trim() === '') {
    return false;
  }
  
  return true;
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
  const apiKey = process.env[`AGENT${agentNumber}_API_KEY`] || process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.error(`No Google API key found for agent ${agentId}. Check your .env file.`);
    throw new Error(`No Google API key is set for agent ${agentId}. Please check your .env file for AGENT${agentNumber}_API_KEY or GOOGLE_API_KEY`);
  }
  
  return apiKey;
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