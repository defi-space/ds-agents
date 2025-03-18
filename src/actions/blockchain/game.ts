import { action } from "@daydreamsai/core";
import { z } from "zod";
import { executeQuery } from "../../utils/graphql";
import { normalizeAddress, getStarknetChain, getAgentAddress, getTokenBalance } from "../../utils/starknet";
import { getContractAddress } from "../../utils/contracts";
import { GET_GAME_SESSION_STATUS } from "../../utils/queries";

export const gameActions = [
  action({
    name: "getGameAgents",
    description: "Retrieves the list of agent addresses and their staked amounts in a game session. Allows an agent to check if it is registered in the game session. Example: getGameAgents({ sessionAddress: '0x123abc...' })",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the game session to query agents for (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.sessionAddress) {
          return {
            success: false,
            error: "Game session address is required",
            message: "Cannot retrieve game agents: session address is missing",
            timestamp: Date.now()
          };
        }

        const sessionAddress = call.data.sessionAddress;
        const currentAgentAddress = await getAgentAddress();
        
        if (!currentAgentAddress) {
          return {
            success: false,
            error: "Agent address not found",
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
            error: "Failed to retrieve game agents",
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
          data: {
            agents,
            currentAgentAddress,
            isInGame,
            totalAgents: numAgents
          },
          message: isInGame 
            ? `Successfully retrieved ${numAgents} game agents. Your agent is registered in this game session.` 
            : `Successfully retrieved ${numAgents} game agents. Your agent is NOT registered in this game session.`,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to get game agents:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to get game agents",
          message: `Failed to retrieve game agents: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
  }),

  action({
    name: "endGame",
    description: "Ends the current game session if the agent has reached the winning threshold of 7,000,000 He3 tokens. This action will trigger the distribution of rewards to the winner and finalize the game session. Example: endGame({ sessionAddress: '0x123abc...' })",
    schema: z.object({
      sessionAddress: z.string().regex(/^0x[a-fA-F0-9]+$/).describe("The Starknet address of the game session to end (in hex format)")
    }),
    handler: async (call, ctx, agent) => {
      try {
        // Input validation
        if (!call.data.sessionAddress) {
          return {
            success: false,
            error: "Game session address is required",
            message: "Cannot end game: session address is missing",
            timestamp: Date.now()
          };
        }

        const sessionAddress = call.data.sessionAddress;
        const agentAddress = await getAgentAddress();
        
        if (!agentAddress) {
          return {
            success: false,
            error: "Agent address not found",
            message: "Cannot end game: failed to get agent address",
            timestamp: Date.now()
          };
        }
        
        // Get the game session info to verify it's active
        const sessionResult = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizeAddress(sessionAddress)
        });
        
        if (!sessionResult || !sessionResult.gameSession) {
          return {
            success: false,
            error: "Game session not found",
            message: `No game session found for address ${sessionAddress}`,
            timestamp: Date.now()
          };
        }
        
        const gameSession = sessionResult.gameSession;
        
        // Check if game is already over
        if (gameSession.is_over) {
          return {
            success: false,
            error: "Game is already over",
            message: "Cannot end game: the game session is already over",
            timestamp: Date.now()
          };
        }
        
        // Check if game is suspended
        if (gameSession.is_suspended) {
          return {
            success: false,
            error: "Game is suspended",
            message: "Cannot end game: the game session is suspended",
            timestamp: Date.now()
          };
        }
        
        // Check if the agent has enough He3 tokens to win
        const he3Address = getContractAddress('resources', 'helium3');
        const he3Balance = await getTokenBalance(he3Address, agentAddress);
        const winThreshold = gameSession.token_win_condition_threshold;
        
        if (BigInt(he3Balance) < BigInt(winThreshold)) {
          return {
            success: false,
            error: "Winning threshold not met",
            message: `Cannot end game: agent has ${he3Balance} He3 tokens but needs ${winThreshold} to win`,
            data: {
              currentBalance: he3Balance,
              requiredBalance: winThreshold,
              remaining: (BigInt(winThreshold) - BigInt(he3Balance)).toString()
            },
            timestamp: Date.now()
          };
        }
        
        // End the game by calling the smart contract
        const chain = getStarknetChain();
        const result = await chain.write({
          contractAddress: sessionAddress,
          entrypoint: "end_game",
          calldata: []
        });
        
        if (result?.statusReceipt !== 'success') {
          return {
            success: false,
            error: 'Transaction failed',
            data: {
              transactionHash: result.transactionHash,
              receipt: result
            },
            message: "Failed to end game. The transaction was submitted but did not complete successfully.",
            timestamp: Date.now()
          };
        }
        
        return {
          success: true,
          data: {
            transactionHash: result.transactionHash,
            receipt: result,
            gameSession: {
              address: sessionAddress,
              winningAgent: agentAddress
            }
          },
          message: "Successfully ended the game and claimed victory!",
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Failed to end game:', error);
        return {
          success: false,
          error: (error as Error).message || "Failed to end game",
          message: `Failed to end game: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now()
        };
      }
    },
  }),
]; 