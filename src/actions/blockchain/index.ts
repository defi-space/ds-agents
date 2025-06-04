import { ammActions } from "./amm";
import { yieldActions } from "./yield";
import { indexerActions } from "./indexer";
import { faucetActions } from "./faucet";
import { utilsActions } from "./utils";
import { gameActions } from "./game";

export const blockchainActions = [
  ...faucetActions,
  ...ammActions,
  ...yieldActions,
  ...indexerActions,
  ...utilsActions,
  ...gameActions,
];
