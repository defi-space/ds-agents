import { action, z } from "@daydreamsai/core";
import { executeQuery, normalizeAddress } from "../../utils/graphql";
import { getStarknetChain, getTokenBalance, convertU256ToDecimal } from "../../utils/starknet";
import { getCoreAddress, getAgentAddress, getResourceAddress } from "../../utils/contracts";
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
        const sessionAddress = getCoreAddress("gameSession");
        if (!sessionAddress) {
          return {
            success: false,
            message: "Cannot end game: session address is missing",
            timestamp: Date.now(),
          };
        }

        const agentAddress = getAgentAddress();

        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot end game: failed to get agent address",
            timestamp: Date.now(),
          };
        }

        const sessionResult = await executeQuery(GET_GAME_SESSION_STATUS, {
          address: normalizeAddress(sessionAddress),
        });

        if (!sessionResult || !sessionResult.gameSession) {
          return {
            success: false,
            message: `No game session found for address ${sessionAddress}`,
            timestamp: Date.now(),
          };
        }

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
        const chain = getStarknetChain();
        const he3Address = getResourceAddress("He3");
        const he3Balance = await getTokenBalance(he3Address, agentAddress);
        const winThreshold = await chain.read({
          contractAddress: sessionAddress,
          entrypoint: "get_winning_threshold",
          calldata: [],
        });
        const formattedWinThreshold = convertU256ToDecimal(winThreshold[0], winThreshold[1]);

        if (he3Balance < formattedWinThreshold) {
          return {
            success: false,
            message: `Cannot end game: agent has ${he3Balance.toString()} Helium-3 (He3) tokens but needs ${formattedWinThreshold} Helium-3 (He3) total tokens to win`,
            data: {
              currentBalance: he3Balance.toString(),
              requiredBalance: String(formattedWinThreshold),
              remaining: (formattedWinThreshold - he3Balance).toString(),
            },
            timestamp: Date.now(),
          };
        }

        const result = await chain.write({
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
