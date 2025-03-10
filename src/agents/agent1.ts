import { createAgent } from "./common";
import { setCurrentAgentId } from "../utils/starknet";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set the current agent ID for Starknet operations
// Use the environment variable if available, otherwise use the hardcoded value
const AGENT_ID = process.env.CURRENT_AGENT_ID || "agent-1";;
setCurrentAgentId(AGENT_ID);

const config = {
  id: AGENT_ID,
  googleApiKey: process.env.AGENT1_API_KEY || process.env.GOOGLE_API_KEY,
  starknetConfig: {
    rpcUrl: process.env.STARKNET_RPC_URL!,
    address: process.env.AGENT1_ADDRESS!,
    privateKey: process.env.AGENT1_PRIVATE_KEY!,
  }
}

// Create agent with specific configuration
const agent = createAgent(config);

// Start the agent
agent.start({
  id: AGENT_ID,
});