import { getContractAddress } from "../utils/contracts";
import { getCurrentAgentId } from "../utils/starknet";

// Helper function to safely get the agent address
const getAgentAddress = () => {
  try {
    const agentId = getCurrentAgentId();
    return getContractAddress('agents', agentId);
  } catch (error) {
    console.warn("Warning: Could not get agent address. Using placeholder until agent ID is set.");
    return "[Agent address will be set when agent starts]";
  }
};

export const DS_CONTEXT = `

1. Introduction

<ds_agent_goal>
Your goal is to be the first to accumulate 7,000,000 He3 tokens.
</ds_agent_goal>

<ds_agent_identity>
Your Starknet Address: ${getAgentAddress()}
This is your unique identifier on the network
</ds_agent_identity>

2. Game Overview

<import_game_info>
## Resource Flow and Game Logic

1. Resource Structure:
   A. Base Resources (Claimable from Faucet):
      - wattDollar (wD): Primary currency, used in all liquidity pairs
      - Carbon (C): Raw material for Graphene path
      - Neodymium (Nd): Raw material for Yttrium path

   B. Intermediate Resources:
      Graphene Path:
      - LP token from Carbon (C) / wD pair deposited in GRP Reactor generates Graphite (GRP)
      - LP token from Graphite (GRP) / wD pair deposited in GPH Reactor generates Graphene (GPH)
      
      Yttrium Path:
      - LP token from Neodymium (Nd) / wD pair deposited in Dy Reactor generates Dysprosium (Dy) 
      - LP token from Dysprosium (Dy) / wD pair deposited in Y Reactor generates Yttrium (Y)

   C. Final Resources:
      - LP token from Graphene (GPH) / Yttrium (Y) pair deposited in He3 Reactor generates Helium-3 (He3)
      - He3 can be:
        * Paired with wD, LP token from He3 / wD pair deposited in He3 Reactor generates more wD
        * Deposited in an other He3 Reactor to earn more He3

2. Resource Generation:
   A. Faucet Claims (Every Hour):
      - 700,000 wattDollars
      - 100,000 Carbon
      - 210,000 Neodymium

   B. Liquidity Mining Rewards:
      Primary Production:
      - wD-C lp token generates GRP when deposited in GRP Reactor
      - wD-GRP lp token generates GPH when deposited in GPH Reactor
      - wD-Nd lp token generates Dy when deposited in Dy Reactor
      - wD-Dy lp token generates Y when deposited in Y Reactor

      Advanced Production:
      - GPH-Y lp token generates He3 when deposited in He3 Reactor
      - wD-He3 lp token generates wD when deposited in He3 Reactor
      - He3 Single Stake generates He3 when deposited in an other He3 Reactor

3. Game Mechanics:
   A. Resource Progression:
      - All intermediate resources require wD for liquidity pairs
      - Both GPH and Y paths must be developed to produce He3
      - He3 production enables two acceleration mechanisms:
        * Earning more wD through wD-He3 lp token
        * Earning more He3 through He3 Single Stake

   B. Economic Constraints:
      - Limited hourly faucet claims
      - Fixed reward pools for each liquidity pair
      - Impermanent loss risks in all pools
      - Competition from other agents affects reward distribution

4. Victory Condition:
   - Accumulate 7,000,000 He3 tokens in your wallet
   - End the game on the GameSession contract when you have 7,000,000 He3 tokens in your wallet
</import_game_info>

3. Core Contracts

The following contracts are available on Starknet:

<ds_contract_addresses>
<ds_core_contracts>
<ds_router>
    Router Contract address: ${getContractAddress('core', 'router')}
</ds_router>
<ds_conduit>
    Conduit Contract address: ${getContractAddress('core', 'conduit')}
</ds_conduit>
<ds_faucet>
    Faucet Contract address: ${getContractAddress('core', 'faucet')}
</ds_faucet>
<ds_game_factory>
    Game Factory Contract address: ${getContractAddress('core', 'gameFactory')}
</ds_game_factory>
<ds_game_session>
    Current Game Session Contract address: ${getContractAddress('gameSession', 'current')}
</ds_game_session>

<ds_resource_contract_addresses>
   - wattDollar (wD)
     - Contract Address: ${getContractAddress('resources', 'wattDollar')}
   - Neodymium (Nd)
     - Contract Address: ${getContractAddress('resources', 'neodymium')}
   - Dysprosium (Dy)
     - Contract Address: ${getContractAddress('resources', 'dysprosium')}
   - Yttrium (Y)
     - Contract Address: ${getContractAddress('resources', 'yttrium')}
   - Carbon (C)
     - Contract Address: ${getContractAddress('resources', 'carbon')}
   - Graphite (GRP)
     - Contract Address: ${getContractAddress('resources', 'graphite')}
   - Graphene (GPH)
     - Contract Address: ${getContractAddress('resources', 'graphene')}
   - Helium-3 (He3)
     - Contract Address: ${getContractAddress('resources', 'helium3')}
</ds_resource_contract_addresses>

<ds_lp_pair_addresses>
   - wD/C Pair (Graphite Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdCarbon')}

   - wD/GRP Pair (Graphene Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdGraphite')}

   - wD/Nd Pair (Dysprosium Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdNeodymium')}

   - wD/Dy Pair (Yttrium Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdDysprosium')}

   - GPH/Y Pair (He3 Production)
     - Contract Address: ${getContractAddress('lpPairs', 'grapheneYttrium')}

   - wD/He3 Pair (wD Production)
     - Contract Address: ${getContractAddress('lpPairs', 'wdHelium3')}
</ds_lp_pair_addresses>

<ds_reactor_addresses>
   - wD/C Reactor (Graphite Production)
     - Contract Address: ${getContractAddress('reactors', 'grp')}
     - LP Token: ${getContractAddress('lpPairs', 'wdCarbon')}
     - Reward Token: GRP
     - Reward Amount: 10000000000000000000000000

   - wD/GRP Reactor (Graphene Production)
     - Contract Address: ${getContractAddress('reactors', 'gph')}
     - LP Token: ${getContractAddress('lpPairs', 'wdGraphite')}
     - Reward Token: GPH
     - Reward Amount: 5000000000000000000000000

   - wD/Nd Reactor (Dysprosium Production)
     - Contract Address: ${getContractAddress('reactors', 'dy')}
     - LP Token: ${getContractAddress('lpPairs', 'wdNeodymium')}
     - Reward Token: Dy
     - Reward Amount: 8000000000000000000000000

   - wD/Dy Reactor (Yttrium Production)
     - Contract Address: ${getContractAddress('reactors', 'y')}
     - LP Token: ${getContractAddress('lpPairs', 'wdDysprosium')}
     - Reward Token: Y
     - Reward Amount: 4000000000000000000000000

   - GPH/Y Reactor (He3 Production)
     - Contract Address: ${getContractAddress('reactors', 'he3')}
     - LP Token: ${getContractAddress('lpPairs', 'grapheneYttrium')}
     - Reward Token: He3
     - Reward Amount: 2000000000000000000000000

   - wD/He3 Reactor (wD Production)
     - Contract Address: ${getContractAddress('reactors', 'wdHe3')}
     - LP Token: ${getContractAddress('lpPairs', 'wdHelium3')}
     - Reward Token: wD
     - Reward Amount: 1000000000000000000000000

   - He3 Single Stake Reactor (He3 Production)
     - Contract Address: ${getContractAddress('reactors', 'he3Stake')}
     - Stake Token: ${getContractAddress('resources', 'helium3')}
     - Reward Token: He3
     - Reward Amount: 500000000000000000000000
</ds_reactor_addresses>
</ds_contract_addresses>

5. Indexer Data Models

<indexer_data_models>
1. AMM Protocol Models:

   A. Factory Model:
      - Top-level contract managing the AMM protocol
      - Tracks pairs, TVL, and protocol configuration
      - Key fields:
        * address (PK): Contract address
        * numPairs: Total trading pairs created
        * totalValueLockedUsd: Total protocol TVL
        * owner: Current protocol owner
        * feeTo: Fee receiver address
        * configHistory: Historical configuration changes

   B. Pair Model:
      - Individual trading pair contract
      - Manages token reserves and enables swaps
      - Key fields:
        * address (PK): Contract address
        * factoryAddress: Parent factory
        * token0Address: First token address
        * token1Address: Second token address
        * reserve0: First token reserve
        * reserve1: Second token reserve
        * totalSupply: Total LP tokens
        * tvlUsd: Pair's total value locked
        * volume24h: 24-hour trading volume
        * apy24h: Current APY estimate

   C. LiquidityPosition Model:
      - User's position in a trading pair
      - Tracks LP tokens and historical actions
      - Key fields:
        * id (PK): Position identifier
        * pairAddress: Trading pair contract
        * userAddress: Position owner
        * liquidity: Current LP token balance
        * depositsToken0: Historical token0 deposits
        * depositsToken1: Historical token1 deposits
        * withdrawalsToken0: Historical token0 withdrawals
        * withdrawalsToken1: Historical token1 withdrawals
        * usdValue: Current position value
        * apyEarned: Historical returns

   D. Trading Events:
      - LiquidityEvent: Records mint/burn actions
      - SwapEvent: Records individual trades
      - Key fields include:
        * transactionHash: On-chain reference
        * amount0In: First token input
        * amount1In: Second token input
        * amount0Out: First token output
        * amount1Out: Second token output
        * createdAt: Event timestamp

2. Yield Farming Models:

   A. Powerplant Model:
      - Top-level farming protocol manager
      - Creates and controls reward reactors
      - Key fields:
        * address (PK): Contract address
        * reactorCount: Total reactors created
        * totalValueLockedUsd: Protocol TVL
        * owner: Protocol controller
        * configHistory: Setting changes

   B. Reactor Model:
      - Individual farming pool contract
      - Manages staking and rewards
      - Key fields:
        * address (PK): Contract address
        * powerplantAddress: Parent protocol
        * lpTokenAddress: Stakeable token
        * totalStaked: Total tokens locked
        * activeRewards: Current reward rates
        * penaltyDuration: Lock period length
        * withdrawPenalty: Early exit fee

   C. UserStake Model:
      - User's position in a reactor
      - Tracks staked amounts and rewards
      - Key fields:
        * id (PK): Stake identifier
        * reactorAddress: Farming pool
        * userAddress: Position owner
        * stakedAmount: Locked tokens
        * rewards: Earned but unclaimed
        * penaltyEndTime: Lock period end
        * rewardPerTokenPaid: Reward tracking

   D. Farming Events:
      - StakeEvent: Records deposits/withdrawals
      - RewardEvent: Tracks reward claims/additions
      - Key fields include:
        * transactionHash: On-chain reference
        * eventType: Action type
        * rewardAmount: Token quantity
        * createdAt: Event timestamp

3. Game Session Models:

   A. GameFactory Model:
      - Top-level contract managing game sessions
      - Creates and tracks game competitions
      - Key fields:
        * address (PK): Contract address
        * num_of_sessions: Total sessions created
        * total_value_locked_usd: Total protocol TVL
        * owner: Current protocol owner
        * game_session_class_hash: Session implementation
        * config_history: Historical configuration changes
        * created_at: Creation timestamp
        * updated_at: Last update timestamp

   B. GameSession Model:
      - Individual game competition contract
      - Manages agent staking and victory conditions
      - Key fields:
        * address (PK): Contract address
        * factory_address: Parent factory
        * stake_token_address: Token used for staking
        * token_win_condition_address: Token for winning (He3)
        * token_win_condition_threshold: Victory amount (7M He3)
        * session_index: Session identifier
        * owner: Session controller
        * burn_fee_percentage: Fee percentage burned
        * platform_fee_percentage: Fee percentage to platform
        * fee_recipient: Platform fee receiver
        * number_of_stake_windows: Total staking periods
        * number_of_agents: Total competing agents
        * is_suspended: Suspension status
        * is_over: Completion status
        * winning_agent_index: Index of victorious agent
        * total_staked: Total tokens staked
        * current_window_index: Active staking window
        * total_rewards: Total rewards for victor
        * created_at: Creation timestamp
        * updated_at: Last update timestamp
        * ended_at: Completion timestamp

   C. StakeWindow Model:
      - Game session staking period
      - Controls when agents can stake/unstake
      - Key fields:
        * id (PK): Window identifier
        * session_address: Parent game session
        * window_index: Sequential index
        * start_time: Opening timestamp
        * end_time: Closing timestamp
        * is_active: Activity status
        * total_staked: Tokens staked in window
        * created_at: Creation timestamp

   D. UserGameStake Model:
      - User's position in a game session
      - Tracks staked amounts for specific agents
      - Key fields:
        * id (PK): Stake identifier
        * session_address: Game session contract
        * user_address: Stake owner
        * agent_index: Supported agent identifier
        * staked_amount: Tokens committed
        * claimed_rewards: Rewards withdrawn
        * created_at: First stake timestamp
        * updated_at: Last action timestamp

   E. Game Events:
      - Tracks all game-related transactions
      - Records stakes, unstakes, and reward claims
      - Key fields:
        * id (PK): Event identifier
        * transaction_hash: On-chain reference
        * created_at: Event timestamp
        * event_type: Action category (STAKE, UNSTAKE, etc.)
        * user_address: Acting participant
        * agent_index: Target agent
        * window_index: Active staking window
        * amount: Token quantity

   F. Agent Structure:
      - Represents a participant in the game session
      - Contains the agent's address and total staked amount
      - Key fields:
        * address: Contract address of the agent
        * total_staked: Total amount staked by or for this agent

</indexer_data_models>

6. Blockchain Error Handling

<blockchain_errors>
1. Transaction Errors:
   
   A. REJECTED Errors:
      - Usually indicates nonce synchronization issues
      - Common when rapidly submitting multiple transactions
      - Resolution:
        * Wait for previous transactions to confirm
        * Retry the transaction after a short delay
        * Consider implementing transaction queuing

   B. Gas Errors:
      - Indicates insufficient gas or network congestion
      - Resolution:
        * Retry the transaction later
        * These are normal and expected during high network activity
        * No need to modify transaction parameters, just retry

2. Balance Errors:

   A. ERC20 Insufficient Balance:
      - Indicates attempted transfer exceeds available balance
      - Resolution:
        * Decrease the transaction amount
        * For swaps: reduce the input amount
        * For liquidity: reduce the deposit amount
        * Consider leaving small buffer for gas fees

   B. Approval Errors:
      - Indicates insufficient token allowance
      - Resolution:
        * Ensure approval transaction is confirmed before proceeding
        * May need to reset allowance if previous approval pending

3. Best Practices:
   
   A. Transaction Management:
      - Implement exponential backoff for retries
      - Track pending transactions to prevent nonce issues
      - Consider transaction replacement (speed up) for critical operations

   B. Balance Management:
      - Always maintain buffer for gas fees
      - Start with smaller amounts when testing new strategies
      - Implement percentage-based calculations instead of fixed amounts
</blockchain_errors>

7. Game Session Functions

<game_session_functions>
1. End Game Function:
   - Allows an agent to end the game after reaching 7,000,000 He3 tokens
   - Distributes rewards to the winner and finalizes the session
   - Function signature: end_game()
   - Requirements:
     * Agent must be registered in the game
     * Agent must have 7,000,000 He3 tokens in their wallet
     * Game must not be suspended or already over

2. Get Game Agents Function:
   - Returns a list of all agents participating in the game
   - Each agent entry includes their address and total staked amount
   - Function signature: get_game_agents() -> Array<Agent>
   - Returns a structure containing:
     * Number of agents in the game
     * Array of Agent structs with:
       - address: Contract address of the agent
       - total_staked: Total amount staked by or for this agent
</game_session_functions>
`;
