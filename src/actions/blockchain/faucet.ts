import { action, z } from "@daydreamsai/core";
import { getStarknetChain } from "../../utils/starknet";
import { getCoreAddress, getAgentAddress } from "../../utils/contracts";

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
    name: "claimFromFaucet",
    description:
      "Claims tokens from the faucet to get wattDollar (wD), carbon (C), and neodymium (Nd)",
    instructions:
      "Use this action when you need tokens. Note there is a one (1) hour cooldown between claims on the contract.",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (_args, _ctx, _agent) => {
      try {
        // Get faucet address
        const faucetAddress = getCoreAddress("faucet");
        if (!faucetAddress) {
          return {
            success: false,
            message: "Cannot claim tokens: faucet contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get agent address
        const agentAddress = getAgentAddress();
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
            message: `Cannot claim yet.\nPlease wait approximately ${status.minutesLeft} minutes before claiming again.`,
            data: {
              secondsLeft: status.timeLeft / 1000,
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

        // Check if transaction was successful
        if (result?.statusReceipt !== "success") {
          return {
            success: false,
            message:
              "Failed to claim tokens from faucet.\nThe transaction was submitted but did not complete successfully.",
            receipt: result,
            timestamp: Date.now(),
          };
        }

        // Return result
        return {
          success: true,
          message:
            "Successfully claimed 7,000,000 wattDollar (wD), 100,000 Carbon (C), 210,000 Neodymium (Nd) from faucet",
          txHash: result.transactionHash,
          data: {
            claimedTokens: {
              wD: "7,000,000",
              C: "100,000",
              Nd: "210,000",
            },
            nextClaimTime: new Date(
              (Math.floor(Date.now() / 1000) + status.interval) * 1000
            ).toISOString(),
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        // Log error
        console.error("Failed to claim from faucet:", error);
        return {
          success: false,
          message: `Failed to claim tokens from faucet: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Faucet claim action failed:", error);
      ctx.emit("faucetClaimError", { action: ctx.call.name, error: error.message });
    },
  }),

  action({
    name: "getFaucetClaimStatus",
    description:
      "Checks whether tokens can be claimed from the faucet and when the next claim will be available.",
    instructions:
      "Use this action when you need to know if its possible to claim tokens now OR when the next possible claim time is.",
    schema: z.object({
      message: z.string().describe("Not used - can be ignored").default("None"),
    }),
    handler: async (_args, _ctx, _agent) => {
      try {
        // Get faucet address
        const faucetAddress = getCoreAddress("faucet");
        if (!faucetAddress) {
          return {
            success: false,
            message:
              "Cannot check faucet status: faucet contract address not found in configuration",
            timestamp: Date.now(),
          };
        }

        // Get agent address
        const agentAddress = getAgentAddress();
        if (!agentAddress) {
          return {
            success: false,
            message: "Cannot check faucet status: failed to retrieve agent address",
            timestamp: Date.now(),
          };
        }

        // Check faucet status
        const status = await checkFaucetStatus(faucetAddress, agentAddress);

        // Return result
        return {
          success: true,
          message: status.canClaim
            ? "You can claim tokens from the faucet now"
            : `You need to wait approximately ${status.minutesLeft} minutes before claiming again`,
          data: {
            secondsLeft: status.timeLeft / 1000,
            minutesLeft: status.minutesLeft,
            lastClaim: status.lastClaim,
            interval: status.interval,
            canClaim: status.canClaim,
            nextClaimTime: status.canClaim
              ? "Available now"
              : new Date((status.lastClaim + status.interval) * 1000).toISOString(),
          },
          timestamp: Date.now(),
        };
      } catch (error) {
        // Log error
        console.error("Failed to check faucet status:", error);
        return {
          success: false,
          message: `Failed to check faucet claim status: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        };
      }
    },
    retry: 3,
    onError: async (error, ctx, _agent) => {
      console.error("Faucet status check failed:", error);
      ctx.emit("faucetStatusError", { action: ctx.call.name, error: error.message });
    },
  }),
];
