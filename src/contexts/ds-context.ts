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
      - Carbon (C): Raw material for Graphene production
      - Neodymium (Nd): Raw material for Yttrium production

   B. Intermediate Resources:
      Required Component 1 - Graphene Production:
      - LP token from Carbon (C) / wD pair deposited in GRP Farm generates Graphite (GRP)
      - LP token from Graphite (GRP) / wD pair deposited in GPH Farm generates Graphene (GPH)
      
      Required Component 2 - Yttrium Production:
      - LP token from Neodymium (Nd) / wD pair deposited in Dy Farm generates Dysprosium (Dy) 
      - LP token from Dysprosium (Dy) / wD pair deposited in Y Farm generates Yttrium (Y)

   C. Final Resources:
      - He3 Production (Requires Both Components):
        * Graphene (GPH) and Yttrium (Y) must be combined in a liquidity pair
        * LP token from GPH/Y pair deposited in He3 Farm generates Helium-3 (He3)
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
      - Both Graphene (GPH) and Yttrium (Y) production lines must be developed simultaneously
      - He3 production is only possible by combining both GPH and Y in a liquidity pair
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

<ds_available_lp_pair_addresses>
   - wD/C Pair (Graphite Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdCarbon')}
     - Token0: ${getContractAddress('resources', 'wattDollar')}
     - Token1: ${getContractAddress('resources', 'carbon')}

   - wD/GRP Pair (Graphene Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdGraphite')}
     - Token0: ${getContractAddress('resources', 'wattDollar')}
     - Token1: ${getContractAddress('resources', 'graphite')}

   - wD/Nd Pair (Dysprosium Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdNeodymium')}
     - Token0: ${getContractAddress('resources', 'wattDollar')}
     - Token1: ${getContractAddress('resources', 'neodymium')}

   - wD/Dy Pair (Yttrium Path)
     - Contract Address: ${getContractAddress('lpPairs', 'wdDysprosium')}
     - Token0: ${getContractAddress('resources', 'wattDollar')}
     - Token1: ${getContractAddress('resources', 'dysprosium')}

   - GPH/Y Pair (He3 Production)
     - Contract Address: ${getContractAddress('lpPairs', 'grapheneYttrium')}
     - Token0: ${getContractAddress('resources', 'graphene')}
     - Token1: ${getContractAddress('resources', 'yttrium')}

   - wD/He3 Pair (wD Production)
     - Contract Address: ${getContractAddress('lpPairs', 'wdHelium3')}
     - Token0: ${getContractAddress('resources', 'wattDollar')}
     - Token1: ${getContractAddress('resources', 'helium3')}
</ds_available_lp_pair_addresses>

<ds_available_farm_addresses>
   - wD/C Farm (Graphite Production)
     - Contract Address: ${getContractAddress('farms', 'grp')}
     - LP Token: ${getContractAddress('lpPairs', 'wdCarbon')}
     - Reward Token: GRP

   - wD/GRP Farm (Graphene Production)
     - Contract Address: ${getContractAddress('farms', 'gph')}
     - LP Token: ${getContractAddress('lpPairs', 'wdGraphite')}
     - Reward Token: GPH

   - wD/Nd Farm (Dysprosium Production)
     - Contract Address: ${getContractAddress('farms', 'dy')}
     - LP Token: ${getContractAddress('lpPairs', 'wdNeodymium')}
     - Reward Token: Dy

   - wD/Dy Farm (Yttrium Production)
     - Contract Address: ${getContractAddress('farms', 'y')}
     - LP Token: ${getContractAddress('lpPairs', 'wdDysprosium')}
     - Reward Token: Y

   - GPH/Y Farm (He3 Production)
     - Contract Address: ${getContractAddress('farms', 'he3')}
     - LP Token: ${getContractAddress('lpPairs', 'grapheneYttrium')}
     - Reward Token: He3

   - wD/He3 Farm (wD Production)
     - Contract Address: ${getContractAddress('farms', 'wdHe3')}
     - LP Token: ${getContractAddress('lpPairs', 'wdHelium3')}
     - Reward Token: wD

   - He3 Single Stake Farm (He3 Production)
     - Contract Address: ${getContractAddress('farms', 'he3Stake')}
     - Stake Token: ${getContractAddress('resources', 'helium3')}
     - Reward Token: He3

</ds_available_farm_addresses>
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
