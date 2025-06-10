import { gql } from "graphql-request";

// AMM Queries
export const GET_PAIR_INFO = gql`
  query GetPairInfo($address: String!, $gameSessionId: Int!) {
    pair(where: { address: { _eq: $address }, gameSessionId: { _eq: $gameSessionId } }) {
      lpTokenName
      token0Symbol
      token1Symbol
      reserve0
      reserve1
      totalSupply
    }
  }
`;

export const GET_FARM_INFO = gql`
  query GetFarmInfo($address: String!, $gameSessionId: Int!) {
    farm(where: { address: { _eq: $address }, gameSessionId: { _eq: $gameSessionId } }) { 
      lpTokenName
      totalStaked
      rewards {
        initialAmount
        remainingAmount
        rewardTokenSymbol
        periodFinish
      }
    }
  }
`;

export const GET_ALL_FARMS = gql`
  query GetAllFarms($gameSessionId: Int!) {
    farm(where: { gameSessionId: { _eq: $gameSessionId } }) {
      lpTokenName
      totalStaked
      rewards {
        initialAmount
        remainingAmount
        rewardTokenSymbol
        periodFinish
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
      depositsToken0
      depositsToken1
      withdrawalsToken0
      withdrawalsToken1
      liquidity
      pair {
        lpTokenName
        token0Symbol
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
      farm {
        lpTokenName
      }
      stakedAmount
      rewardStates {
        reward {
          rewardTokenSymbol
        }
      }
    }
  }
`;

export const GET_FARM_INDEX_BY_ADDRESS = gql`
  query GetFarmIndexByAddress($address: String!, $gameSessionId: Int!) {
    farm(where: { 
      address: { _eq: $address },
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
      gameSuspended
      gameOver
    }
  }
`;

export const GET_GAME_SESSION_INFO = gql`
  query GetGameSessionInfo($address: String!) {
    gameSession(where: { address: { _eq: $address } }) {
      address
      gameSessionIndex
      gameFactory
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
