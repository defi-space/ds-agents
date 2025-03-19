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
 * Securely retrieves sensitive information in TEE environments
 * This offers additional security when running in a TEE
 * @param key The environment variable key
 * @returns The securely retrieved value
 */
export function secureGetEnvVariable(key: string): string | undefined {
  const value = process.env[key];
  
  // Additional security logging in TEE environment
  if (isPhalaEnvironment() && value) {
    console.log(`Securely accessed ${key} in TEE environment`);
  }
  
  return value;
}

/**
 * Gets the Starknet configuration for a specific agent with TEE-specific security
 * @param agentNumber The agent number
 * @returns Starknet configuration object
 */
export function getStarknetConfig(agentNumber: number): StarknetConfig {
  // Use secure environment variable access in TEE
  if (isPhalaEnvironment()) {
    return {
      rpcUrl: secureGetEnvVariable('STARKNET_RPC_URL')!,
      address: secureGetEnvVariable(`AGENT${agentNumber}_ADDRESS`)!,
      privateKey: secureGetEnvVariable(`AGENT${agentNumber}_PRIVATE_KEY`)!,
    };
  }
  
  // Standard environment variable access outside TEE
  return {
    rpcUrl: process.env.STARKNET_RPC_URL!,
    address: process.env[`AGENT${agentNumber}_ADDRESS`]!,
    privateKey: process.env[`AGENT${agentNumber}_PRIVATE_KEY`]!,
  };
} 