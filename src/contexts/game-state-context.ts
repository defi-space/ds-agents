import { context, render } from "@daydreamsai/core";
import { z } from "zod";
import { getCurrentAgentId } from "../utils/starknet";

// Define token balance schema
const tokenBalanceSchema = z.object({
  symbol: z.string().describe("Token symbol (e.g., 'He3', 'wD')"),
  name: z.string().describe("Full token name"),
  balance: z.number().describe("Current balance"),
  decimals: z.number().describe("Token decimals"),
  address: z.string().describe("Token contract address"),
  lastUpdated: z.number().describe("Timestamp of last balance update"),
});

// Define LP position schema
const liquidityPositionSchema = z.object({
  pairSymbol: z.string().describe("LP pair symbol (e.g., 'He3-wD')"),
  tokenA: z.string().describe("First token in pair"),
  tokenB: z.string().describe("Second token in pair"),
  lpTokenBalance: z.number().describe("LP token balance"),
  tokenAContribution: z.number().describe("Amount of tokenA contributed"),
  tokenBContribution: z.number().describe("Amount of tokenB contributed"),
  feesEarned: z.object({
    tokenA: z.number(),
    tokenB: z.number(),
  }).describe("Fees earned from position"),
  lpTokenAddress: z.string().describe("LP token contract address"),
  lastUpdated: z.number().describe("Timestamp of last position update"),
});

// Define reactor position schema
const reactorPositionSchema = z.object({
  reactorName: z.string().describe("Name of the reactor (e.g., 'GPH Reactor')"),
  reactorAddress: z.string().describe("Address of the reactor contract"),
  lpToken: z.string().describe("LP token deposited"),
  deposited: z.number().describe("Amount of LP tokens deposited"),
  pendingRewards: z.number().describe("Pending rewards"),
  rewardToken: z.string().describe("Reward token symbol"),
  lastUpdated: z.number().describe("Timestamp of last position update"),
});

// Define pair data schema
const pairDataSchema = z.object({
  pairSymbol: z.string().describe("Symbol for the pair (e.g., 'He3-wD')"),
  tokenA: z.string().describe("Symbol for token A"),
  tokenB: z.string().describe("Symbol for token B"),
  reserveA: z.number().describe("Reserve of token A"),
  reserveB: z.number().describe("Reserve of token B"),
  price: z.number().describe("Current price ratio"),
  lastUpdated: z.number().describe("Timestamp of last update"),
});

// Define faucet status schema
const faucetStatusSchema = z.object({
  token: z.string().describe("Token symbol"),
  lastClaimed: z.number().describe("Timestamp of last claim"),
  cooldownEnds: z.number().describe("Timestamp when cooldown ends"),
  claimableNow: z.boolean().describe("Whether token is claimable now"),
});

// Define game state memory schema
export interface GameStateMemory {
  agentId: string;
  tokenBalances: z.infer<typeof tokenBalanceSchema>[];
  liquidityPositions: z.infer<typeof liquidityPositionSchema>[];
  reactorPositions: z.infer<typeof reactorPositionSchema>[];
  pairData: z.infer<typeof pairDataSchema>[];
  faucetStatus: z.infer<typeof faucetStatusSchema>[];
  lastScanned: number;
  targetToken: {
    symbol: string;
    targetAmount: number;
    currentAmount: number;
    percentageComplete: number;
  };
  observedPatterns: string[];
  recentTransactions: {
    hash: string;
    type: string;
    status: 'pending' | 'success' | 'failed';
    timestamp: number;
    details: string;
  }[];
}

// Updated template to use simpler format without complex conditionals
const template = `
# Game State Dashboard
Agent ID: {{agentId}}
Last Updated: {{lastUpdatedTime}}

## Goal Progress
Target: {{targetAmount}} {{targetSymbol}}
Current: {{currentAmount}} {{targetSymbol}} ({{percentageComplete}}% complete)

## Token Balances
{{tokenBalancesDisplay}}

## Liquidity Positions
{{liquidityPositionsDisplay}}

## Reactor Positions
{{reactorPositionsDisplay}}

## Trading Pairs
{{pairDataDisplay}}

## Faucet Status
{{faucetStatusDisplay}}

## Observed Patterns
{{patternsDisplay}}

## Recent Transactions
{{transactionsDisplay}}

## Creative Exploration
As you observe the state of the game, consider what novel approaches or unexpected combinations of actions might lead to accelerated {{targetSymbol}} accumulation. The most effective strategy may not be immediately obvious - experimentation is encouraged.
`;

// Create the game state context
export const gameStateContext = context({
  type: "game-state",
  
  // Schema for initializing the context
  schema: z.object({
    id: z.string().describe("Unique identifier for this game state context instance"),
  }),

  // Key function to uniquely identify this context instance
  key({ id }) {
    return `game-state-${id}`;
  },

  // Create initial memory state
  create(): GameStateMemory {
    const currentAgentId = getCurrentAgentId();
    
    return {
      agentId: currentAgentId,
      tokenBalances: [
        {
          symbol: "He3",
          name: "Helium-3",
          balance: 0,
          decimals: 18,
          address: "0x...", // Placeholder
          lastUpdated: Date.now(),
        },
        {
          symbol: "wD",
          name: "Watt Dollar",
          balance: 0,
          decimals: 18,
          address: "0x...", // Placeholder
          lastUpdated: Date.now(),
        },
        {
          symbol: "C",
          name: "Carbon",
          balance: 0,
          decimals: 18,
          address: "0x...", // Placeholder
          lastUpdated: Date.now(),
        },
        {
          symbol: "Nd",
          name: "Neodymium",
          balance: 0,
          decimals: 18,
          address: "0x...", // Placeholder
          lastUpdated: Date.now(),
        },
      ],
      liquidityPositions: [],
      reactorPositions: [],
      pairData: [],
      faucetStatus: [
        {
          token: "wD",
          lastClaimed: 0,
          cooldownEnds: 0,
          claimableNow: true,
        },
        {
          token: "C",
          lastClaimed: 0,
          cooldownEnds: 0,
          claimableNow: true,
        },
        {
          token: "Nd",
          lastClaimed: 0,
          cooldownEnds: 0,
          claimableNow: true,
        },
      ],
      lastScanned: Date.now(),
      targetToken: {
        symbol: "He3",
        targetAmount: 7000000,
        currentAmount: 0,
        percentageComplete: 0,
      },
      observedPatterns: [],
      recentTransactions: [],
    };
  },

  // Render function with improved template handling
  render({ memory }: { memory: GameStateMemory }) {
    const lastUpdatedTime = new Date(memory.lastScanned).toISOString();
    
    // Format token balances with explicit string conversion for numbers
    const tokenBalancesDisplay = memory.tokenBalances.length > 0 
      ? memory.tokenBalances.map(token => 
          `- ${token.symbol}: ${String(token.balance)} (${token.name})`
        ).join('\n')
      : "No token balances available.";
    
    // Format liquidity positions with explicit string conversion for numbers
    let liquidityPositionsDisplay = "No active liquidity positions.";
    if (memory.liquidityPositions.length > 0) {
      const positions = memory.liquidityPositions.map(pos => {
        return `- ${pos.pairSymbol}: ${String(pos.lpTokenBalance)} LP tokens\n` +
               `  • ${pos.tokenA}: ${String(pos.tokenAContribution)}\n` +
               `  • ${pos.tokenB}: ${String(pos.tokenBContribution)}\n` +
               `  • Fees earned: ${String(pos.feesEarned.tokenA)} ${pos.tokenA}, ${String(pos.feesEarned.tokenB)} ${pos.tokenB}`;
      });
      liquidityPositionsDisplay = positions.join('\n');
    }
    
    // Format reactor positions
    let reactorPositionsDisplay = "No active reactor positions.";
    if (memory.reactorPositions.length > 0) {
      const positions = memory.reactorPositions.map(pos => {
        return `- ${pos.reactorName}: ${String(pos.deposited)} LP tokens\n` +
               `  • Pending rewards: ${String(pos.pendingRewards)} ${pos.rewardToken}`;
      });
      reactorPositionsDisplay = positions.join('\n');
    }
    
    // Format pair data
    let pairDataDisplay = "No pair data available.";
    if (memory.pairData.length > 0) {
      const pairs = memory.pairData.map(pair => {
        return `- ${pair.pairSymbol}\n` +
               `  • Price: 1 ${pair.tokenA} = ${String(pair.price)} ${pair.tokenB}\n` +
               `  • Reserves: ${String(pair.reserveA)} ${pair.tokenA}, ${String(pair.reserveB)} ${pair.tokenB}`;
      });
      pairDataDisplay = pairs.join('\n');
    }
    
    // Format faucet status
    const faucetStatusDisplay = memory.faucetStatus.length > 0
      ? memory.faucetStatus.map(status => {
          const claimableText = status.claimableNow 
            ? "✅ Available to claim now" 
            : `⏳ Cooldown ends ${new Date(status.cooldownEnds).toLocaleString()}`;
          return `- ${status.token}: ${claimableText}`;
        }).join('\n')
      : "No faucet information available.";
    
    // Format observed patterns
    const patternsDisplay = memory.observedPatterns.length > 0
      ? memory.observedPatterns.map(pattern => `- ${pattern}`).join('\n')
      : "No patterns observed yet. Record interesting observations here as you notice them.";
    
    // Format recent transactions
    const transactionsDisplay = memory.recentTransactions.length > 0
      ? memory.recentTransactions.map(tx => {
          const statusEmoji = tx.status === 'success' ? '✅' : (tx.status === 'pending' ? '⏳' : '❌');
          const time = new Date(tx.timestamp).toLocaleTimeString();
          return `- ${statusEmoji} ${tx.type} (${time}): ${tx.details}`;
        }).join('\n')
      : "No recent transactions.";
    
    // Return the template with all values properly converted to strings
    return render(template, {
      agentId: memory.agentId,
      lastUpdatedTime: lastUpdatedTime,
      targetAmount: String(memory.targetToken.targetAmount),
      targetSymbol: memory.targetToken.symbol,
      currentAmount: String(memory.targetToken.currentAmount),
      percentageComplete: String(memory.targetToken.percentageComplete),
      tokenBalancesDisplay: tokenBalancesDisplay,
      liquidityPositionsDisplay: liquidityPositionsDisplay,
      reactorPositionsDisplay: reactorPositionsDisplay,
      pairDataDisplay: pairDataDisplay,
      faucetStatusDisplay: faucetStatusDisplay,
      patternsDisplay: patternsDisplay,
      transactionsDisplay: transactionsDisplay
    });
  },
});

// Export a combined context that includes multiple contexts
export const gameContexts = [gameStateContext]; 