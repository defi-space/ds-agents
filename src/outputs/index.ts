import { goalManagerOutput } from './goal-manager';
import { broadcastOutput } from './broadcast';

export const outputs = {
  "goal-manager:state": goalManagerOutput,
  "agent:broadcast": broadcastOutput,
};
