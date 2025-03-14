import { goalContexts } from './goal-context';
import { gameStateContext, gameContexts } from './game-state-context';
import { strategyContext, strategyContexts } from './strategy-context';

// Export individual contexts for fine-grained control
export {
  goalContexts,
  gameStateContext,
  strategyContext,
};

// Export context groups for specific use cases
export {
  gameContexts,
  strategyContexts,
};

// Combined context collection for a complete agent setup
export const allContexts = [
  ...gameContexts,
  ...strategyContexts,
  goalContexts,
];

// Default export for convenience
export default allContexts; 