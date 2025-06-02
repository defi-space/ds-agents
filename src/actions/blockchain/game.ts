import { action, z } from "@daydreamsai/core";
import { executeQuery } from "../../utils/graphql";
import {
  normalizeAddress,
  getStarknetChain,
  getAgentAddress,
  getTokenBalance,
  formatTokenBalance,
} from "../../utils/starknet";
import { getContractAddress } from "../../utils/contracts";
import { GET_GAME_SESSION_STATUS } from "../../utils/queries";

export const gameActions = [
  action({
    name: "endGameSession",
    description:
      "Ends the current game session if you have reached the winning threshold of helium-3 (He3) tokens",
    instructions:
      "Use this action when you have accumulated enough helium-3 (He3) tokens to win and want to end the game session",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        // Get session address
        const sessionAddress = getContractAddress("gameSession", "current");

        // Check if session address is missing
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot end game: session address is missing",
            timestamp: Date.now(),
          };
        }

        // Get agent address
        const agentAddress = await getAgentAddress();

        // Check if agent address is missing
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot end game: failed to get agent address",
            timestamp: Date.now(),
          };
        }

        // Get session status
        const sessionResult = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizeAddress(sessionAddress),
        });

        // Check if session result is missing
        if (!sessionResult || !sessionResult.gameSession) {
          return {
            success: false,
            message: `No game session found for address ${sessionAddress}`,
            timestamp: Date.now(),
          };
        }

        // Get game session
        const gameSession = sessionResult.gameSession;

        // Check if game is already over
        if (gameSession.gameOver) {
          return {
            success: false,
            message: "Cannot end game: the game session is already over",
            timestamp: Date.now(),
          };
        }

        if (gameSession.gameSuspended) {
          return {
            success: false,
            message: "Cannot end game: the game session is suspended",
            timestamp: Date.now(),
          };
        }

        // Get helium-3 (He3) address
        const he3Address = getContractAddress("resources", "helium3");

        // Get helium-3 (He3) balance
        const he3Balance = await getTokenBalance(he3Address, agentAddress);

        // Get win threshold
        const winThreshold = gameSession.tokenWinConditionThreshold;

        // Convert winThreshold to string, then remove any decimal part before BigInt conversion
        const thresholdStr = String(winThreshold);
        const integerPart = thresholdStr.includes(".")
            ? thresholdStr.split(".")[0]
            : thresholdStr;
          const winThresholdBigInt = BigInt(integerPart);

          if (he3Balance < winThresholdBigInt) {
            return {
              success: false,
              message: `Cannot end game: you have ${formatTokenBalance(he3Balance)} helium-3 (He3) tokens but need ${formatTokenBalance(winThresholdBigInt)} helium-3 (He3) total tokens to win`,
              data: {
                currentBalance: formatTokenBalance(he3Balance),
                requiredBalance: formatTokenBalance(winThresholdBigInt),
                remaining: formatTokenBalance(winThresholdBigInt - he3Balance),
              },
              timestamp: Date.now(),
            };
          }

        // Get chain
        const starknetChain = getStarknetChain();

        // End game session
        const result = await starknetChain.write({
          contractAddress: sessionAddress,
          entrypoint: "end_game",
          calldata: [],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message:
              "Failed to end game. The transaction was submitted but did not complete successfully.",
            receipt: result,
            timestamp: Date.now(),
          };
        }

        // Return result
        return {
          success: true,
          message: "Successfully ended the game and claimed victory!",
          txHash: result.transactionHash,
          data: {
            gameSession: {
              address: sessionAddress,
              winningAgent: agentAddress,
            },
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        // Log error
        console.error("Failed to end game:", error);
        return {
          success: false,
          message: `Failed to end game: ${(error as Error).message || "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`End game action failed:`, error);
      ctx.emit("endGameError", { action: ctx.call.name, error: error.message });
    },
  }),
];
