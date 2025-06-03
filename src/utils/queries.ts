import { gql } from "graphql-request";

// AMM Queries
export const GET_PAIR_INFO = gql`
  query GetPairInfo($address: String!, $gameSessionId: Int!) {
    pair(where: { address: { _eq: $address }, gameSessionId: { _eq: $gameSessionId } }) {
      address
      factoryAddress
      gameSessionId
      lpTokenName
      lpTokenSymbol
      token0Address
      token0Name
      token0Symbol
      token1Address
      token1Name
      token1Symbol
      reserve0
      reserve1
      totalSupply
      factory {
        address
        numOfPairs
      }
    }
  }
`;

export const GET_FARM_INFO = gql`
  query GetFarmInfo($address: String!, $gameSessionId: Int!) {
    farm(where: { address: { _eq: $address }, gameSessionId: { _eq: $gameSessionId } }) {
      address 
      factoryAddress
      farmIndex
      gameSessionId
      lpTokenAddress
      lpTokenName
      lpTokenSymbol
      rewardTokens
      totalStaked
      activeRewards
      rewards {
        address
        decimals
        initialAmount
        remainingAmount
        rewardTokenName
        rewardTokenSymbol
        periodFinish
        rewardsDuration
      }
    }
  }
`;

export const GET_ALL_FARMS = gql`
  query GetAllFarms($gameSessionId: Int!) {
    farm(where: { gameSessionId: { _eq: $gameSessionId } }) {
      address 
      factoryAddress
      farmIndex
      gameSessionId
      lpTokenAddress
      lpTokenName
      lpTokenSymbol
      rewardTokens
      totalStaked
      activeRewards
      rewards {
        address
        decimals
        initialAmount
        remainingAmount
        rewardTokenName
        rewardTokenSymbol
        periodFinish
        rewardsDuration
      }
    }
  }
`;

export const GET_AGENT_LIQUIDITY_POSITIONS = gql`
  query GetAgentLiquidityPositions($agentAddress: String!, $gameSessionId: Int!) {
    liquidityPosition(
      where: { 
        agentAddress: { _eq: $agentAddress },
        pair: { gameSessionId: { _eq: $gameSessionId } }
      }
    ) {
      agentAddress
      depositsToken0
      depositsToken1
      withdrawalsToken0
      withdrawalsToken1
      liquidity
      pairAddress
      pair {
        gameSessionId
        lpTokenName
        lpTokenSymbol
        token0Address
        token0Name
        token0Symbol
        token1Address
        token1Name
        token1Symbol
        reserve0
        reserve1
        totalSupply
      }
    }
  }
`;

export const GET_AGENT_FARM_POSITIONS = gql`
  query GetAgentFarmPositions($agentAddress: String!, $gameSessionId: Int!) {
    agentStake(
      where: { 
        agentAddress: { _eq: $agentAddress },
        farm: { gameSessionId: { _eq: $gameSessionId } }
      }
    ) {
      agentAddress
      farmAddress
      stakedAmount
      rewardStates {
        lastPendingRewards
        rewardTokenAddress
        rewardPerTokenPaid
        reward {
          rewardTokenName
          rewardTokenSymbol
        }
      }
    }
  }
`;

export const GET_FARM_INDEX_BY_LP_TOKEN = gql`
  query GetFarmIndexByLpToken($lpTokenAddress: String!, $gameSessionId: Int!) {
    farm(where: { 
      lpTokenAddress: { _eq: $lpTokenAddress },
      gameSessionId: { _eq: $gameSessionId }
    }) {
      farmIndex
    }
  }
    
`;

// Game Session Queries
export const GET_GAME_SESSION_STATUS = gql`
  query GetGameSessionStatus($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      address
      gameSuspended
      gameOver
    }
  }
`;

export const GET_GAME_SESSION_INFO = gql`
  query GetGameSessionInfo($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      address
      gameFactory
      gameSessionIndex
      tokenWinConditionAddress
      tokenWinConditionName
      tokenWinConditionSymbol
      tokenWinConditionThreshold
    }
  }
`;

export const GET_GAME_SESSION_INDEX_BY_ADDRESS = gql`
  query GetGameSessionIndexByAddress($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      gameSessionIndex
    }
  }
`;
