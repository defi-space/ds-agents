import { action } from "@daydreamsai/core";
import { z } from "zod";
import { getStarknetChain } from "../../utils/starknet";
import { getContractAddress } from "../../utils/contracts";
import { getAgentAddress } from "../../utils/starknet";

// Helper function to check faucet status
async function checkFaucetStatus(contractAddress: string, agentAddress: string) {
  const chain = getStarknetChain();
  const [lastClaim, interval] = await Promise.all([
    chain.read({
      contractAddress,
      entrypoint: "get_last_claim",
      calldata: [agentAddress]
    }),
    chain.read({
      contractAddress,
      entrypoint: "get_claim_interval",
      calldata: []
    })
  ]);

  const canClaim = Date.now() >= (Number(lastClaim) + Number(interval)) * 1000;
  const timeLeft = ((Number(lastClaim) + Number(interval)) * 1000) - Date.now();
  const minutesLeft = Math.ceil(timeLeft / (1000 * 60));

  return {
    lastClaim,
    interval,
    canClaim,
    timeLeft,
    minutesLeft,
    timestamp: Date.now(),
  };
}

// Faucet Operations
export const faucetActions = [
    action({
      name: "claimFaucet",
      description: "Claims tokens from the faucet with a one-hour cooldown period. Distributes a fixed amount of three different tokens: 70,000 wattDollar (wD) for energy trading, 10,000 Carbon (C) for emissions tracking, and 10,000 Neodymium (Nd) for renewable energy components. Automatically checks claim eligibility and enforces cooldown period. Returns detailed transaction information and claim status.",
      schema: z.object({
        message: z.string().describe("Ignore this field, it is not needed").default("None"), // Useless but needed for the schema
      }),
      handler: async (call, ctx, agent) => {
        try {
          const faucetAddress = getContractAddress('core', 'faucet');
          const agentAddress = await getAgentAddress();
          
          // Check if enough time has passed since last claim
          const status = await checkFaucetStatus(faucetAddress, agentAddress);
          
          if (!status.canClaim) {
            return {
              success: false,
              message: `Cannot claim yet. Please wait approximately ${status.minutesLeft} minutes before claiming again.`,
              timestamp: Date.now(),
            };
          }

          const chain = getStarknetChain();
          const result = await chain.write({
            contractAddress: faucetAddress,
            entrypoint: "claim",
            calldata: []
          });
          if (result?.statusReceipt !== 'success') {
            return {
              success: false,
              error: 'Transaction failed',
              transactionHash: result.transactionHash,
              receipt: result,
              message: "Failed to claim tokens from faucet",
              timestamp: Date.now(),
            };
          }
  
          return {
            success: true,
            transactionHash: result.transactionHash,
            receipt: result,
            message: "Claimed 70,000 wD, 10,000 C, 10,000 Nd from faucet",
            timestamp: Date.now(),
          };
        } catch (error) {
          console.error('Failed to claim from faucet:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to claim from faucet',
            timestamp: Date.now(),
          };
        }
      },
    }),
  
    action({
      name: "getClaimTimeStatus",
      description: "Provides comprehensive information about the faucet's current claim status. Checks and returns the time remaining until next eligible claim, last claim timestamp, cooldown interval, and current claim availability. Useful for monitoring faucet cooldown periods and planning token claims. All time-related values are returned in both milliseconds and human-readable format (minutes).",
      schema: z.object({
        message: z.string().describe("Ignore this field, it is not needed").default("None"), // Useless but needed for the schema
      }),
      handler: async (call, ctx, agent) => {
        try {
          const faucetAddress = getContractAddress('core', 'faucet');
          const agentAddress = await getAgentAddress();
          
          const status = await checkFaucetStatus(faucetAddress, agentAddress);
          
          return {
            success: true,
            timeLeft: status.timeLeft,
            minutesLeft: status.minutesLeft,
            lastClaim: status.lastClaim,
            interval: status.interval,
            canClaim: status.canClaim,
            timestamp: Date.now(),
          };
        } catch (error) {
          console.error('Failed to check faucet status:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to check faucet status',
            timestamp: Date.now(),
          };
        }
      },
    }),
  ];