import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createDreams, createContainer, LogLevel, type MemoryStore } from "@daydreamsai/core";
import { createFirebaseMemoryStore } from "@daydreamsai/firebase";
import { createChromaVectorStore } from "@daydreamsai/chromadb";
import { autonomousCli, cli } from "../extensions";
import { actions } from "../actions";
import { setCurrentAgentId } from "../utils/starknet";
import dotenv from "dotenv";

import {
  StarknetConfigStore,
  validateAgentNumber,
  getAgentId,
  isManualMode,
  getStarknetConfig,
  getChromaDbUrl,
  getFirebaseConfig,
  getCollectionName,
} from "./utils";

// Load environment variables
dotenv.config();

/**
 * Agent configuration interface
 */
export interface AgentConfig {
  id: string;
  openrouterApiKey?: string;
  starknetConfig?: {
    rpcUrl: string;
    address: string;
    privateKey: string;
  };
  firebaseConfig?: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
}

/**
 * Creates the appropriate model based on agent number using OpenRouter
 * @param agentNumber The agent number (1-4)
 * @param config The agent configuration
 * @returns The model instance
 */
function createModelForAgent(agentNumber: number, config: AgentConfig) {
  const openrouterApiKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) {
    throw new Error("OpenRouter API key is required");
  }

  const openrouter = createOpenRouter({
    apiKey: openrouterApiKey,
  });

  switch (agentNumber) {
    case 1: {
      // Agent 1: Google Gemini 2.0 Flash via OpenRouter
      return openrouter("google/gemini-2.0-flash-001");
    }
    case 2: {
      // Agent 2: xAI Grok Beta via OpenRouter
      return openrouter("x-ai/grok-3-mini");
    }
    case 3: {
      // Agent 3: OpenAI GPT-4o Mini via OpenRouter
      return openrouter("openai/gpt-4.1-mini");
    }
    case 4: {
      // Agent 4: Anthropic Claude 3.5 Haiku via OpenRouter
      return openrouter("anthropic/claude-3.5-haiku");
    }
    default:
      throw new Error(`Unsupported agent number: ${agentNumber}`);
  }
}

/**
 * Creates an agent with the specified configuration
 * @param config The agent configuration
 * @returns The created agent instance
 */
export async function createAgent(config: AgentConfig) {
  // Get agent number from ID
  const agentNumber = Number.parseInt(config.id.split("-")[1], 10);

  // Store Starknet configuration if provided
  if (config.starknetConfig) {
    StarknetConfigStore.getInstance().setConfig(config.id, config.starknetConfig);
  }

  let memoryStore: MemoryStore;

  // Initialize model based on agent number
  try {
    const model = createModelForAgent(agentNumber, config);

    // Get the service URLs
    const chromaDbUrl = getChromaDbUrl();

    // Get the collection name using the helper function
    const collectionName = await getCollectionName(config.id);

    // Create the Firebase memory store
    try {
      const firebaseOptions = config.firebaseConfig || getFirebaseConfig();

      // Create the Firebase memory store with verbose logging enabled
      // The enhanced createFirebaseMemory will handle table creation internally
      memoryStore = await createFirebaseMemoryStore({
        serviceAccount: {
          projectId: firebaseOptions.projectId,
          clientEmail: firebaseOptions.clientEmail,
          privateKey: firebaseOptions.privateKey || "",
        },
        collectionName,
      });
    } catch (firebaseError) {
      const errorMessage =
        firebaseError instanceof Error ? firebaseError.message : String(firebaseError);
      throw new Error(`Failed to connect to Firebase for agent ${config.id}: ${errorMessage}`);
    }

    // Configure agent settings
    const agentConfig = {
      id: config.id,
      logLevel: LogLevel.DEBUG,
      container: createContainer(),
      model,
      extensions: [isManualMode() ? cli : autonomousCli],
      memory: {
        store: memoryStore,
        vector: createChromaVectorStore(collectionName, chromaDbUrl),
      },
      exportTrainingData: true,
      trainingDataPath: `./grpo/group-training-data-${config.id}.jsonl`,
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
    openrouterApiKey: process.env[`AGENT${agentNumber}_OPENROUTER_API_KEY`] || process.env.OPENROUTER_API_KEY,
    starknetConfig: getStarknetConfig(agentNumber),
    firebaseConfig: getFirebaseConfig(),
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
  const agentNumber = Number.parseInt(process.env.AGENT_NUMBER || "1", 10);
  createAndStartAgent(agentNumber).catch((error) => {
    console.error(`Failed to start agent: ${error.message}`);
    process.exit(1);
  });
}
