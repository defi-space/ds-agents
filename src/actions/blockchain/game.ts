import { action } from "@daydreamsai/core";
import { z } from "zod";
import { executeQuery } from "../../utils/graphql";
import { normalizeAddress, getStarknetChain, getAgentAddress, getTokenBalance } from "../../utils/starknet";
import { getContractAddress } from "../../utils/contracts";
import { GET_GAME_SESSION_STATUS } from "../../utils/queries";

export const gameActions = [
  action({
    name: "getGameAgents",
    description: "Retrieves the list of agent addresses and their staked amounts in a game session",
    instructions: "Use this action when an agent needs to check which agents are registered in a game session and their stake amounts",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const sessionAddress = getContractAddress('gameSession', 'current');
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot retrieve game agents: session address is missing.",
            timestamp: Date.now()
          };
        }

        const currentAgentAddress = await getAgentAddress();
        
        if (!currentAgentAddress) {
          return {
            success: false,
            message: "Cannot retrieve game agents: failed to get current agent address",
            timestamp: Date.now()
          };
        }
        
        // Call the contract method to get game agents
        const chain = getStarknetChain();
        const result = await chain.read({
          contractAddress: sessionAddress,
          entrypoint: "get_game_agents",
          calldata: []
        });
        
        if (!result || !Array.isArray(result)) {
          return {
            success: false,
            message: "Contract did not return valid game agents data",
            timestamp: Date.now()
          };
        }
        
        // Parse the agents data
        // The response format is [num_agents, agent1_address, agent1_total_staked, agent2_address, agent2_total_staked, ...]
        const numAgents = Number(result[0]);
        const agents = [];
        
        for (let i = 0; i < numAgents; i++) {
          const addressIndex = 1 + (i * 2);
          const stakedIndex = addressIndex + 1;
          
          if (addressIndex < result.length && stakedIndex < result.length) {
            agents.push({
              address: '0x' + BigInt(result[addressIndex]).toString(16).padStart(64, '0'),
              totalStaked: result[stakedIndex]
            });
          }
        }
        
        // Check if current agent is in the game
        const isInGame = agents.some(gameAgent => 
          normalizeAddress(gameAgent.address) === normalizeAddress(currentAgentAddress)
        );
        
        return {
          success: true,
          message: isInGame 
            ? `Successfully retrieved ${numAgents} game agents. Your agent is registered in this game session.` 
            : `Successfully retrieved ${numAgents} game agents. Your agent is NOT registered in this game session.`,
          data: {
            agents,
            currentAgentAddress,
            isInGame,
            totalAgents: numAgents
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get game agents:', error);
        return {
          success: false,
          message: `Failed to retrieve game agents: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Get game agents action failed:`, error);
      ctx.emit("getGameAgentsError", { action: ctx.call.name, error: error.message });
    }
  }),

  action({
    name: "endGame",
    description: "Ends the current game session if the agent has reached the winning threshold of He3 tokens",
    instructions: "Use this action when an agent has accumulated enough He3 tokens to win and wants to end the game session",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const sessionAddress = getContractAddress('gameSession', 'current');
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot end game: session address is missing",
            timestamp: Date.now()
          };
        }

        const agentAddress = await getAgentAddress();
        
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot end game: failed to get agent address",
            timestamp: Date.now()
          };
        }
        
        const sessionResult = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizeAddress(sessionAddress)
        });
        
        if (!sessionResult || !sessionResult.gameSession) {
          return {
            success: false,
            message: `No game session found for address ${sessionAddress}`,
            timestamp: Date.now()
          };
        }
        
        const gameSession = sessionResult.gameSession;
        
        // Check if game is already over
        if (gameSession.gameOver) {
          return {
            success: false,
            message: "Cannot end game: the game session is already over",
            timestamp: Date.now()
          };
        }
        
        if (gameSession.gameSuspended) {
          return {
            success: false,
            message: "Cannot end game: the game session is suspended",
            timestamp: Date.now()
          };
        }
        
        const he3Address = getContractAddress('resources', 'helium3');
        const he3Balance = await getTokenBalance(he3Address, agentAddress);
        const winThreshold = gameSession.tokenWinConditionThreshold;
        
        // Handle the conversion from DecimalField to BigInt safely
        try {
          // Convert winThreshold to string, then remove any decimal part before BigInt conversion
          const thresholdStr = String(winThreshold);
          // Split at decimal point and take only the integer part
          const integerPart = thresholdStr.includes('.') ? thresholdStr.split('.')[0] : thresholdStr;
          const winThresholdBigInt = BigInt(integerPart);
          
          if (he3Balance < winThresholdBigInt) {
            return {
              success: false,
              message: `Cannot end game: agent has ${he3Balance.toString()} He3 tokens but needs ${winThreshold} to win`,
              data: {
                currentBalance: he3Balance.toString(),
                requiredBalance: String(winThreshold),
                remaining: (winThresholdBigInt - he3Balance).toString()
              },
              timestamp: Date.now()
            };
          }
        } catch (error) {
          console.error('Error comparing token balances:', error);
          return {
            success: false,
            message: `Failed to compare token balances: ${(error as Error).message || "Unknown error"}`,
            timestamp: Date.now()
          };
        }
        
        const chain = getStarknetChain();
        const result = await chain.write({
          contractAddress: sessionAddress,
          entrypoint: "end_game",
          calldata: []
        });
        
        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            message: "Failed to end game. The transaction was submitted but did not complete successfully.",
            receipt: result,
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          message: "Successfully ended the game and claimed victory!",
          txHash: result.transactionHash,
          data: {
            gameSession: {
              address: sessionAddress,
              winningAgent: agentAddress
            }
          },
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to end game:', error);
        return {
          success: false,
          message: `Failed to end game: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`End game action failed:`, error);
      ctx.emit("endGameError", { action: ctx.call.name, error: error.message });
    }
  }),
]; 