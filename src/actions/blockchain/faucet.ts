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
      lastClaim: Number(lastClaim),
      interval: Number(interval),
      canClaim,
      timeLeft,
      minutesLeft,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Error checking faucet status:', error);
    throw new Error(`Failed to check faucet status: ${(error as Error).message}`);
  }
}

// Faucet Operations
export const faucetActions = [
    action({
      name: "claimFaucet",
      description: "Claims tokens from the faucet with a one-hour cooldown period. Distributes a fixed amount of three different tokens: 70,000 wattDollar (wD) for energy trading, 10,000 Carbon (C) for emissions tracking, and 10,000 Neodymium (Nd) for renewable energy components. Example: claimFaucet()",
      schema: z.object({
        message: z.string().describe("Ignore this field, it is not needed").default("None"),
      }),
      handler: async (call, ctx, agent) => {
        try {
          const faucetAddress = getContractAddress('core', 'faucet');
          if (!faucetAddress) {
            return {
              success: false,
              error: "Faucet contract address not found",
              message: "Cannot claim tokens: faucet contract address not found in configuration",
              timestamp: Date.now()
            };
          }
          
          const agentAddress = await getAgentAddress();
          if (!agentAddress) {
            return {
              success: false,
              error: "Agent address not found",
              message: "Cannot claim tokens: failed to retrieve agent address",
              timestamp: Date.now()
            };
          }
          
          // Check if enough time has passed since last claim
          const status = await checkFaucetStatus(faucetAddress, agentAddress);
          
          if (!status.canClaim) {
            return {
              success: false,
              error: "Cooldown period not expired",
              data: {
                minutesLeft: status.minutesLeft,
                timeLeft: status.timeLeft,
                lastClaim: status.lastClaim,
                nextClaimTime: new Date((status.lastClaim + status.interval) * 1000).toISOString()
              },
              message: `Cannot claim yet. Please wait approximately ${status.minutesLeft} minutes before claiming again.`,
              timestamp: Date.now()
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
              data: {
                transactionHash: result.transactionHash,
                receipt: result
              },
              message: "Failed to claim tokens from faucet. The transaction was submitted but did not complete successfully.",
              timestamp: Date.now()
            };
          }
          
          return {
            success: true,
            data: {
              transactionHash: result.transactionHash,
              receipt: result,
              claimedTokens: {
                wattDollar: "7,000,000",
                carbon: "100,000",
                neodymium: "210,000"
              },
              nextClaimTime: new Date((Math.floor(Date.now() / 1000) + status.interval) * 1000).toISOString()
            },
            message: "Successfully claimed 7,000,000 wD, 100,000 C, 210,000 Nd from faucet",
            timestamp: Date.now()
          };
        } catch (error) {
          console.error('Failed to claim from faucet:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to claim from faucet',
            message: `Failed to claim tokens from faucet: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now()
          };
        }
      },
    }),
  
    action({
      name: "getClaimTimeStatus",
      description: "Provides comprehensive information about the faucet's current claim status. Checks and returns the time remaining until next eligible claim, last claim timestamp, cooldown interval, and current claim availability. Example: getClaimTimeStatus()",
      schema: z.object({
        message: z.string().describe("Ignore this field, it is not needed").default("None"),
      }),
      handler: async (call, ctx, agent) => {
        try {
          const faucetAddress = getContractAddress('core', 'faucet');
          if (!faucetAddress) {
            return {
              success: false,
              error: "Faucet contract address not found",
              message: "Cannot check faucet status: faucet contract address not found in configuration",
              timestamp: Date.now()
            };
          }
          
          const agentAddress = await getAgentAddress();
          if (!agentAddress) {
            return {
              success: false,
              error: "Agent address not found",
              message: "Cannot check faucet status: failed to retrieve agent address",
              timestamp: Date.now()
            };
          }
          
          const status = await checkFaucetStatus(faucetAddress, agentAddress);
          
          return {
            success: true,
            data: {
              timeLeft: status.timeLeft,
              minutesLeft: status.minutesLeft,
              lastClaim: status.lastClaim,
              lastClaimTime: new Date(status.lastClaim * 1000).toISOString(),
              interval: status.interval,
              intervalInHours: Math.round(status.interval / 3600 * 10) / 10,
              canClaim: status.canClaim,
              nextClaimTime: status.canClaim 
                ? "Available now" 
                : new Date((status.lastClaim + status.interval) * 1000).toISOString()
            },
            message: status.canClaim 
              ? "You can claim tokens from the faucet now" 
              : `You need to wait approximately ${status.minutesLeft} minutes before claiming again`,
            timestamp: Date.now()
          };
        } catch (error) {
          console.error('Failed to check faucet status:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to check faucet status',
            message: `Failed to check faucet claim status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: Date.now()
          };
        }
      },
    }),
  ];