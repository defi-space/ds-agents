import { action } from "@daydreamsai/core";
import { z } from "zod";
import { getStarknetChain } from "../../utils/starknet";
import { getContractAddress } from "../../utils/contracts";
import { getAgentAddress } from "../../utils/starknet";

// Helper function to check faucet status
async function checkFaucetStatus(contractAddress: string, agentAddress: string) {
  const chain = getStarknetChain();
  try {
    const [lastClaim, interval] = await Promise.all([
      chain.read({
        contractAddress,
        entrypoint: "get_last_claim",
        calldata: [agentAddress],
      }),
      chain.read({
        contractAddress,
        entrypoint: "get_claim_interval",
        calldata: [],
      }),
    ]);

    const canClaim = Date.now() >= (Number(lastClaim) + Number(interval)) * 1000;
    const timeLeft = (Number(lastClaim) + Number(interval)) * 1000 - Date.now();
    const minutesLeft = Math.ceil(timeLeft / (1000 * 60));

    return {
      lastClaim: Number(lastClaim),
      interval: Number(interval),
      canClaim,
      timeLeft,
      minutesLeft,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Error checking faucet status:", error);
    throw new Error(`Failed to check faucet status: ${(error as Error).message}`);
  }
}

// Faucet Operations
export const faucetActions = [
  action({
    name: "claimFaucet",
    description:
      "Claims tokens from the faucet to get wattDollar (wD), Carbon (C), and Neodymium (Nd)",
    instructions:
      "Use this action when an agent needs tokens. Note there is a one (1) hour cooldown between claims on the contract.",
    schema: z.object({}),
    handler: async (args, ctx, agent) => {
      try {
        const faucetAddress = getContractAddress("core", "faucet");
        if (!faucetAddress) {
          return {
            success: false,
            message: "Cannot claim tokens: faucet contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        const agentAddress = await getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot claim tokens: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }

        // Check if enough time has passed since last claim
        const status = await checkFaucetStatus(faucetAddress, agentAddress);

        if (!status.canClaim) {
          return {
            success: false,
            message: `Cannot claim yet. Please wait approximately ${status.minutesLeft} minutes before claiming again.`,
            data: {
              minutesLeft: status.minutesLeft,
              nextClaimTime: new Date((status.lastClaim + status.interval) * 1000).toISOString(),
            },
            timestamp: Date.now(),
          };
        }

        const chain = getStarknetChain();
        const result = await chain.write({
          contractAddress: faucetAddress,
          entrypoint: "claim",
          calldata: [],
        });

        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message:
              "Failed to claim tokens from faucet. The transaction was submitted but did not complete successfully.",
            receipt: result,
            timestamp: Date.now(),
          };
        }

        return {
          success: true,
          message:
            "Successfully claimed 7,000,000 wattDollar (wD), 100,000 Carbon (C), 210,000 Neodymium (Nd) from faucet",
          txHash: result.transactionHash,
          data: {
            claimedTokens: {
              wattDollar: "7,000,000",
              carbon: "100,000",
              neodymium: "210,000",
            },
            nextClaimTime: new Date(
              (Math.floor(Date.now() / 1000) + status.interval) * 1000
            ).toISOString(),
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to claim from faucet:", error);
        return {
          success: false,
          message: `Failed to claim tokens from faucet: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Faucet claim action failed:`, error);
      ctx.emit("faucetClaimError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getClaimTimeStatus",
    description:
      "Checks whether tokens can be claimed from the faucet and when the next claim will be available.",
    instructions:
      "Use this action when needing to know if its possible to claim tokens now OR when the next possible claim time is.",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (args, ctx, agent) => {
      try {
        const faucetAddress = getContractAddress("core", "faucet");
        if (!faucetAddress) {
          return {
            success: false,
            message:
              "Cannot check faucet status: faucet contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        const agentAddress = await getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot check faucet status: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }

        const status = await checkFaucetStatus(faucetAddress, agentAddress);

        return {
          success: true,
          message: status.canClaim
            ? "You can claim tokens from the faucet now"
            : `You need to wait approximately ${status.minutesLeft} minutes before claiming again`,
          data: {
            timeLeft: status.timeLeft,
            minutesLeft: status.minutesLeft,
            lastClaim: status.lastClaim,
            lastClaimTime: new Date(status.lastClaim * 1000).toISOString(),
            interval: status.interval,
            intervalInHours: Math.round((status.interval / 3600) * 10) / 10,
            canClaim: status.canClaim,
            nextClaimTime: status.canClaim
              ? "Available now"
              : new Date((status.lastClaim + status.interval) * 1000).toISOString(),
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        console.error("Failed to check faucet status:", error);
        return {
          success: false,
          message: `Failed to check faucet claim status: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, agent) => {
      console.error(`Faucet status check failed:`, error);
      ctx.emit("faucetStatusError", { action: ctx.call.name, error: error.message });
    },
  }),
];
