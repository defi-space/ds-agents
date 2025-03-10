import { setupLogInterceptor } from './logInterceptor';
import { dashboardThought, dashboardAction, dashboardStatus } from '../outputs/dashboard';

// Create a minimal agent context type
interface MinimalAgentContext {
  id: string;
  context?: any;
  args?: any;
  options?: any;
  memory?: any;
  workingMemory?: any;
}

// Create a minimal agent type
interface MinimalAgent {
  id?: string;
  config?: {
    id?: string;
  };
}

/**
 * Set up dashboard integration
 * This function sets up the log interceptor and other dashboard integrations
 */
export function setupDashboardIntegration() {
  // Only set up if dashboard is enabled
  if (process.env.ENABLE_DASHBOARD !== 'true') {
    console.log('Dashboard integration is disabled');
    return;
  }
  
  console.log('Setting up dashboard integration');
  
  // Set up log interceptor to capture agent:think and agent:action logs
  setupLogInterceptor();
  
  // Set initial status for all agents
  if (process.env.CURRENT_AGENT_ID) {
    // Create a minimal context object
    const ctx: MinimalAgentContext = {
      id: process.env.CURRENT_AGENT_ID,
      context: {},
      args: {},
      options: {},
      memory: {},
      workingMemory: {}
    };
    
    // Create a minimal agent object
    const agent: MinimalAgent = {
      id: process.env.CURRENT_AGENT_ID,
      config: {
        id: process.env.CURRENT_AGENT_ID
      }
    };
    
    // Use the handler function instead of calling the output object directly
    try {
      const result = dashboardStatus.handler(
        { status: 'idle' },
        ctx as any,
        agent as any
      );
      
      // Check if result is a Promise
      if (result instanceof Promise) {
        result.catch((err: Error) => {
          console.error('Error setting initial agent status:', err);
        });
      }
    } catch (err) {
      console.error('Error setting initial agent status:', err);
    }
  }
  
  console.log('Dashboard integration set up successfully');
}

/**
 * Enhance an agent with dashboard integration
 * This function adds dashboard integration to an existing agent
 * @param agent The agent to enhance
 */
export function enhanceAgentWithDashboard(agent: any) {
  // Only enhance if dashboard is enabled
  if (process.env.ENABLE_DASHBOARD !== 'true') {
    return agent;
  }
  
  if (!agent) {
    console.error('Cannot enhance undefined agent');
    return agent;
  }
  
  // Get agent ID
  const agentId = agent.config?.id || process.env.CURRENT_AGENT_ID || 'unknown-agent';
  
  console.log(`Enhancing agent ${agentId} with dashboard integration`);
  
  // Hook into agent outputs if available
  if (agent.outputs && typeof agent.outputs === 'object') {
    // Add dashboard outputs if not already present
    if (!agent.outputs['dashboard:thought']) {
      agent.outputs['dashboard:thought'] = dashboardThought;
    }
    
    if (!agent.outputs['dashboard:action']) {
      agent.outputs['dashboard:action'] = dashboardAction;
    }
    
    if (!agent.outputs['dashboard:status']) {
      agent.outputs['dashboard:status'] = dashboardStatus;
    }
    
    // Hook into existing outputs to capture thoughts and actions
    const originalThinkHandler = agent.outputs['think']?.handler;
    if (originalThinkHandler) {
      agent.outputs['think'].handler = async (content: any, ctx: any, ...args: any[]) => {
        // Call dashboard thought handler directly
        try {
          const result = dashboardThought.handler(
            { content: content.content },
            ctx,
            agent
          );
          
          // Check if result is a Promise
          if (result instanceof Promise) {
            await result;
          }
        } catch (err) {
          console.error('Error sending thought to dashboard:', err);
        }
        
        // Call original handler
        return originalThinkHandler(content, ctx, ...args);
      };
    }
  }
  
  // Hook into agent start method
  const originalStart = agent.start;
  if (originalStart && typeof originalStart === 'function') {
    agent.start = async (...args: any[]) => {
      // Update agent status to idle using the handler function
      try {
        // Create a minimal context object if needed
        const ctx = agent.context || {
          id: agentId,
          context: {},
          args: {},
          options: {},
          memory: {},
          workingMemory: {}
        };
        
        const result = dashboardStatus.handler(
          { status: 'idle' },
          ctx,
          agent
        );
        
        // Check if result is a Promise
        if (result instanceof Promise) {
          await result;
        }
      } catch (err) {
        console.error('Error updating agent status:', err);
      }
      
      // Call original start method
      return originalStart.apply(agent, args);
    };
  }
  
  return agent;
} 