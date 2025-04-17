import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createDreams,
  createContainer,
  LogLevel,
} from "@daydreamsai/core";
import { createSupabaseMemoryStore } from "@daydreamsai/supabase";
import { createChromaVectorStore } from "@daydreamsai/chromadb";
import { goalContext } from "../contexts/goal-context";
import { autonomousCli, cli } from "../extensions";
import { actions } from "../actions";
import { setCurrentAgentId } from "../utils/starknet";
import dotenv from 'dotenv';

import { 
  StarknetConfigStore, 
  validateAgentNumber, 
  getAgentId, 
  isManualMode,
  getGoogleApiKey,
  getStarknetConfig,
  getChromaDbUrl,
  getSupabaseConfig
} from './utils';

// Load environment variables
dotenv.config();

/**
 * Agent configuration interface
 */
export interface AgentConfig {
  id: string;
  googleApiKey?: string;
  starknetConfig?: {
    rpcUrl: string;
    address: string;
    privateKey: string;
  };
  supabaseConfig?: {
    url: string;
    apiKey: string;
    tableName?: string;
  };
}

/**
 * Creates an agent with the specified configuration
 * @param config The agent configuration
 * @returns The created agent instance
 */
export async function createAgent(config: AgentConfig) {
  // Get Google API key - prioritize the agent-specific key
  const agentNumber = parseInt(config.id.split('-')[1], 10);
  const googleApiKey = config.googleApiKey || getGoogleApiKey(config.id, agentNumber);
  
  // Store Starknet configuration if provided
  if (config.starknetConfig) {
    StarknetConfigStore.getInstance().setConfig(config.id, config.starknetConfig);
  }

  let memoryStore;
  
  // Initialize Google model
  try {
    const google = createGoogleGenerativeAI({
      apiKey: googleApiKey,
    });
    const model = google("gemini-2.0-flash");
    
    // Create a unique collection name for this agent's vector store
    const collectionName = `${config.id.replace(/-/g, '_')}_collection`;
    
    // Get the service URLs
    const chromaDbUrl = getChromaDbUrl();
    
    // Create the Supabase memory store
    try {
      const supabaseOptions = config.supabaseConfig || getSupabaseConfig();
      
      memoryStore = await createSupabaseMemoryStore({
        url: supabaseOptions.url,
        apiKey: supabaseOptions.apiKey,
        tableName: supabaseOptions.tableName || collectionName,
      });
    } catch (supabaseError) {
      const errorMessage = supabaseError instanceof Error 
        ? supabaseError.message 
        : String(supabaseError);
      throw new Error(`Failed to connect to Supabase for agent ${config.id}: ${errorMessage}`);
    }

    // Configure agent settings
    const agentConfig = {
      id: config.id,
      logger: LogLevel.DEBUG,
      container: createContainer(),
      model,
      extensions: [isManualMode() ? cli : autonomousCli],
      memory: {
        store: memoryStore,
        vector: createChromaVectorStore(collectionName, chromaDbUrl),
      },
      exportTrainingData: true,
      trainingDataPath: `./grpo/group-training-data-${config.id}.jsonl`,
      context: goalContext,
      actions,
    };

    // Create the agent
    const agent = createDreams(agentConfig);
    
    // Set the current agent ID as an environment variable
    process.env.CURRENT_AGENT_ID = config.id;
    
    // Return the agent
    return agent;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize agent ${config.id}: ${errorMessage}`);
  }
}

/**
 * Creates and starts an agent with the specified agent number
 * @param agentNumber The agent number (1-4)
 * @returns The created agent instance
 */
export async function createAndStartAgent(agentNumber: number) {
  // Validate agent number
  validateAgentNumber(agentNumber);

  // Set the current agent ID for Starknet operations
  const AGENT_ID = getAgentId(agentNumber);
  setCurrentAgentId(AGENT_ID);

  // Create agent configuration
  const config = {
    id: AGENT_ID,
    googleApiKey: process.env[`AGENT${agentNumber}_API_KEY`] || process.env.GOOGLE_API_KEY,
    starknetConfig: getStarknetConfig(agentNumber),
    supabaseConfig: getSupabaseConfig()
  };

  // Create agent with specific configuration
  const agent = await createAgent(config);

  // Start the agent
  agent.start({
    id: AGENT_ID,
  });

  return agent;
}

// If this file is run directly, start the agent based on the provided agent number
if (require.main === module) {
  const agentNumber = parseInt(process.env.AGENT_NUMBER || "1", 10);
  createAndStartAgent(agentNumber).catch(error => {
    console.error(`Failed to start agent: ${error.message}`);
    process.exit(1);
  });
} 