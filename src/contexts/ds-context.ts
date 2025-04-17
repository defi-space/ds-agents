import { getContractAddress } from "../utils/contracts";
import { getAgentAddress } from "../utils/starknet";

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
      - LP token from Carbon (C) / wD pair deposited in GRP Farm generates Graphite (GRP)
      - LP token from Graphite (GRP) / wD pair deposited in GPH Farm generates Graphene (GPH)
      
      Yttrium Path:
      - LP token from Neodymium (Nd) / wD pair deposited in Dy Farm generates Dysprosium (Dy) 
      - LP token from Dysprosium (Dy) / wD pair deposited in Y Farm generates Yttrium (Y)

   C. Final Resources:
      - LP token from Graphene (GPH) / Yttrium (Y) pair deposited in He3 Farm generates Helium-3 (He3)
      - He3 can be:
        * Paired with wD, LP token from He3 / wD pair deposited in He3 Farm generates more wD
        * Deposited in an other He3 Farm to earn more He3

2. Resource Generation:
   A. Faucet Claims (Every Hour):
      - 700,000 wattDollars
      - 100,000 Carbon
      - 210,000 Neodymium

   B. Liquidity Mining Rewards:
      Primary Production:
      - wD-C lp token generates GRP when deposited in GRP Farm
      - wD-GRP lp token generates GPH when deposited in GPH Farm
      - wD-Nd lp token generates Dy when deposited in Dy Farm
      - wD-Dy lp token generates Y when deposited in Y Farm

      Advanced Production:
      - GPH-Y lp token generates He3 when deposited in He3 Farm
      - wD-He3 lp token generates wD when deposited in He3 Farm
      - He3 Single Stake generates He3 when deposited in an other He3 Farm

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
<ds_farmRouter>
    FarmRouter Contract address: ${getContractAddress('core', 'farmRouter')}
</ds_farmRouter>
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

<ds_farm_addresses>
   - wD/C Farm (Graphite Production)
     - Contract Address: ${getContractAddress('farms', 'grp')}
     - LP Token: ${getContractAddress('lpPairs', 'wdCarbon')}
     - Reward Token: GRP
     - Reward Amount: 10000000000000000000000000

   - wD/GRP Farm (Graphene Production)
     - Contract Address: ${getContractAddress('farms', 'gph')}
     - LP Token: ${getContractAddress('lpPairs', 'wdGraphite')}
     - Reward Token: GPH
     - Reward Amount: 5000000000000000000000000

   - wD/Nd Farm (Dysprosium Production)
     - Contract Address: ${getContractAddress('farms', 'dy')}
     - LP Token: ${getContractAddress('lpPairs', 'wdNeodymium')}
     - Reward Token: Dy
     - Reward Amount: 8000000000000000000000000

   - wD/Dy Farm (Yttrium Production)
     - Contract Address: ${getContractAddress('farms', 'y')}
     - LP Token: ${getContractAddress('lpPairs', 'wdDysprosium')}
     - Reward Token: Y
     - Reward Amount: 4000000000000000000000000

   - GPH/Y Farm (He3 Production)
     - Contract Address: ${getContractAddress('farms', 'he3')}
     - LP Token: ${getContractAddress('lpPairs', 'grapheneYttrium')}
     - Reward Token: He3
     - Reward Amount: 2000000000000000000000000

   - wD/He3 Farm (wD Production)
     - Contract Address: ${getContractAddress('farms', 'wdHe3')}
     - LP Token: ${getContractAddress('lpPairs', 'wdHelium3')}
     - Reward Token: wD
     - Reward Amount: 1000000000000000000000000

   - He3 Single Stake Farm (He3 Production)
     - Contract Address: ${getContractAddress('farms', 'he3Stake')}
     - Stake Token: ${getContractAddress('resources', 'helium3')}
     - Reward Token: He3
     - Reward Amount: 500000000000000000000000
</ds_farm_addresses>
</ds_contract_addresses>

5. Blockchain Error Handling

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

6. Game Session Functions

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
