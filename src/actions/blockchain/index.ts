import { ammActions } from './amm';
import { yieldActions } from './yield';
import { indexerActions } from './indexer';
import { faucetActions } from './faucet';
import { utilsActions } from './utils';

export const blockchainActions = [
  ...faucetActions,
  ...ammActions,
  ...yieldActions,
  ...indexerActions,
  ...utilsActions,
]; 