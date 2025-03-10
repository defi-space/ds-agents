import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createDreams,
  createContainer,
  LogLevel,
  createMemoryStore,
  createChromaVectorStore,
} from "@daydreamsai/core";
import { goalContexts } from "../contexts/goal-context";
import { autonomousCli, cli } from "../extensions";
import { actions } from "../actions";
import { outputs } from "../outputs";
import dotenv from 'dotenv';
import { enhanceAgentWithDashboard, setupDashboardIntegration } from '../utils/dashboardIntegration';

// Load environment variables
dotenv.config();

// Check if dashboard integration is enabled
const isDashboardEnabled = process.env.ENABLE_DASHBOARD === 'true';

// Set up dashboard integration if enabled
if (isDashboardEnabled) {
  setupDashboardIntegration();
}

// Define agent configuration type
export interface AgentConfig {
  id: string;
  googleApiKey?: string;
  starknetConfig?: {
    rpcUrl: string;
    address: string;
    privateKey: string;
  };
}

// Create a Starknet configuration store
export class StarknetConfigStore {
  private static instance: StarknetConfigStore;
  private configs: Map<string, { rpcUrl: string; address: string; privateKey: string }> = new Map();

  private constructor() {}

  public static getInstance(): StarknetConfigStore {
    if (!StarknetConfigStore.instance) {
      StarknetConfigStore.instance = new StarknetConfigStore();
    }
    return StarknetConfigStore.instance;
  }

  public setConfig(agentId: string, config: { rpcUrl: string; address: string; privateKey: string }): void {
    this.configs.set(agentId, config);
  }

  public getConfig(agentId: string): { rpcUrl: string; address: string; privateKey: string } | undefined {
    return this.configs.get(agentId);
  }
}

// Factory function to create an agent with specific configuration
export function createAgent(config: AgentConfig) {
  // Get Google API key - prioritize the agent-specific key
  const googleApiKey = config.googleApiKey;
  // Ensure API key is available
  if (!googleApiKey) {
    console.error(`No Google API key found for agent ${config.id}. Check your .env file.`);
    throw new Error(`No Google API key is set for agent ${config.id}. Please check your .env file for AGENT${config.id.split('-')[1]}_API_KEY`);
  }

  // Store Starknet configuration if provided
  if (config.starknetConfig) {
    StarknetConfigStore.getInstance().setConfig(config.id, config.starknetConfig);
  }
  // Initialize Google AI model
  const google = createGoogleGenerativeAI({
    apiKey: googleApiKey,
  });
  const model = google("gemini-2.0-flash-001") as any;

  // Get command line arguments to check for manual mode
  const args = process.argv.slice(2);
  const isManualMode = args.includes('--manual');
  
  // Create a unique collection name for this agent's vector store
  const collectionName = `agent-${config.id}-collection`;
  
  // Configure agent settings
  const agentConfig = {
    id: config.id, // Make sure ID is included in the agent config
    logger: LogLevel.DEBUG,
    container: createContainer(),
    model,
    extensions: [isManualMode ? cli : autonomousCli],
    memory: {
      store: createMemoryStore(),
      vector: createChromaVectorStore(collectionName, "http://localhost:8000"),
    },
    context: goalContexts,
    actions,
    outputs,
  };

  // Create the agent
  const agent = createDreams(agentConfig);
  
  // Set the current agent ID as an environment variable
  process.env.CURRENT_AGENT_ID = config.id;
  
  // Enhance agent with dashboard integration if enabled
  if (isDashboardEnabled) {
    return enhanceAgentWithDashboard(agent);
  }
  
  // Return the agent
  return agent;
}