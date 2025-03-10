import { output } from "@daydreamsai/core";
import { z } from "zod";
import axios from "axios";

// Dashboard server URL
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

// Check if dashboard integration is enabled
const isDashboardEnabled = process.env.ENABLE_DASHBOARD === 'true';

/**
 * Extract a readable action type from action data
 * @param actionData The action data
 * @returns A readable action type
 */
function extractActionType(actionData: any): string {
  if (!actionData) return 'UNKNOWN';
  
  // Use the action name if available
  if (actionData.actionName) {
    return actionData.actionName;
  }
  
  // Last resort fallback
  return 'ACTION';
}

/**
 * Create a readable display label for an action
 * @param actionType The action type identifier
 * @param actionData The full action data for context
 * @returns A human-friendly display label
 */
function createActionDisplayLabel(actionType: string, actionData: any): string {
  // Make the action type more readable
  return actionType
    .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
    .trim();
}

/**
 * Process and capture agent:think logs
 * This function can be used to intercept and process agent:think logs
 * @param logData The log data from the agent:think log
 */
export async function captureAgentThink(logData: any) {
  // Only process if dashboard is enabled
  if (!isDashboardEnabled) return;
  
  try {
    // Extract the thought data from the log
    const thought = logData?.data;
    
    if (!thought || !thought.ref || thought.ref !== 'thought' || !thought.content) {
      console.warn('Invalid thought data format:', logData);
      return;
    }
    
    // Try to extract agent ID from the log context or use a default
    let agentId = 'unknown-agent';
    
    // Check if we have a context ID in the thought data
    if (thought.contextId && typeof thought.contextId === 'string') {
      const parts = thought.contextId.split(':');
      if (parts.length > 1) {
        agentId = parts[1];
      }
    } else if (process.env.CURRENT_AGENT_ID) {
      // Fallback to environment variable
      agentId = process.env.CURRENT_AGENT_ID;
    }
    
    const dashboardThought = {
      id: `thought-${thought.timestamp || Date.now()}`,
      agentId,
      content: thought.content,
      timestamp: thought.timestamp || Date.now(),
    };
    
    await axios.post(`${DASHBOARD_URL}/api/thoughts`, {
      agentId,
      thought: dashboardThought,
    });
    
    // Also update agent status to thinking
    await axios.post(`${DASHBOARD_URL}/api/agents/${agentId}/status`, {
      status: 'thinking',
    });
  } catch (error: any) {
    // Silently fail if dashboard is not available
    console.error('Error processing agent:think log:', error.message);
  }
}

/**
 * Process and capture agent:action logs
 * This function can be used to intercept and process agent:action logs
 * @param logData The log data from the agent:action log
 */
export async function captureAgentAction(logData: any) {
  // Only process if dashboard is enabled
  if (!isDashboardEnabled) return;
  
  try {
    // Extract the action data from the log
    const actionData = logData?.data;
    
    if (!actionData) {
      console.warn('Invalid action data format:', logData);
      return;
    }
    
    // Try to extract agent ID from the log context or use a default
    let agentId = 'unknown-agent';
    
    // Check if we have a context ID in the action data
    if (actionData.contextId && typeof actionData.contextId === 'string') {
      const parts = actionData.contextId.split(':');
      if (parts.length > 1) {
        agentId = parts[1];
      }
    } else if (process.env.CURRENT_AGENT_ID) {
      // Fallback to environment variable
      agentId = process.env.CURRENT_AGENT_ID;
    }
    
    // Extract action type
    const actionType = extractActionType(actionData);
    const displayName = createActionDisplayLabel(actionType, actionData);
    
    // Determine action status
    let actionStatus = 'pending';
    if (actionData.status) {
      actionStatus = actionData.status;
    } else if (actionData.error || actionData.errorMessage) {
      actionStatus = 'failed';
    } else if (actionData.result || actionData.txHash) {
      actionStatus = 'success';
    }
    
    // Ensure we have a unique ID for each action
    // If callId is not available, create a unique ID using timestamp and a random string
    const actionId = actionData.callId || 
                    `action-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    const action = {
      id: actionId,
      agentId,
      type: actionType,
      displayName,
      status: actionStatus,
      details: actionData,
      timestamp: Date.now(),
    };
    
    console.log(`Sending action to dashboard for agent: ${agentId}, type: ${actionType}, display: ${displayName}, status: ${actionStatus}, id: ${actionId}`);
    
    await axios.post(`${DASHBOARD_URL}/api/actions`, {
      agentId,
      action,
    });
    
    // Also update agent status to executing
    await axios.post(`${DASHBOARD_URL}/api/agents/${agentId}/status`, {
      status: 'executing',
    });
  } catch (error: any) {
    // Silently fail if dashboard is not available
    console.error('Error processing agent:action log:', error.message);
  }
}

/**
 * Dashboard output for streaming agent thoughts to the dashboard
 */
export const dashboardThought = output({
  description: "Stream agent thoughts to the dashboard",
  schema: z.object({
    content: z.string().describe("The thought content"),
  }),
  handler: async (content, ctx, agent?: any) => {
    // Only send to dashboard if enabled
    if (isDashboardEnabled) {
      try {
        // Try to get agent ID from context, agent object, or use a default
        let agentId = ctx.id || 'unknown-agent';
        
        // If agent object is available, try to get ID from there
        if (agent) {
          if (typeof agent === 'object') {
            if (agent.config && typeof agent.config === 'object' && 'id' in agent.config) {
              agentId = String(agent.config.id);
            } else if ('id' in agent) {
              agentId = String(agent.id);
            }
          }
        } else if (process.env.CURRENT_AGENT_ID) {
          // Fallback to environment variable
          agentId = process.env.CURRENT_AGENT_ID;
        }
        
        const thought = {
          id: `thought-${Date.now()}`,
          agentId,
          content: content.content,
          timestamp: Date.now(),
        };
        
        await axios.post(`${DASHBOARD_URL}/api/thoughts`, {
          agentId,
          thought,
        });
        
        // Also update agent status to thinking
        await axios.post(`${DASHBOARD_URL}/api/agents/${agentId}/status`, {
          status: 'thinking',
        });
      } catch (error: any) {
        // Silently fail if dashboard is not available
        console.error('Error sending thought to dashboard:', error.message);
      }
    }
    
    return {
      data: content,
      timestamp: Date.now(),
    };
  },
});

/**
 * Dashboard output for streaming agent actions to the dashboard
 */
export const dashboardAction = output({
  description: "Stream agent actions to the dashboard",
  schema: z.object({
    type: z.string().describe("The action type"),
    status: z.enum(['pending', 'success', 'failed']).describe("The action status"),
    details: z.record(z.any()).describe("The action details"),
  }),
  handler: async (content, ctx, agent?: any) => {
    // Only send to dashboard if enabled
    if (isDashboardEnabled) {
      try {
        // Try to get agent ID from context, agent object, or use a default
        let agentId = ctx.id || 'unknown-agent';
        
        // If agent object is available, try to get ID from there
        if (agent) {
          if (typeof agent === 'object') {
            if (agent.config && typeof agent.config === 'object' && 'id' in agent.config) {
              agentId = String(agent.config.id);
            } else if ('id' in agent) {
              agentId = String(agent.id);
            }
          }
        } else if (process.env.CURRENT_AGENT_ID) {
          // Fallback to environment variable
          agentId = process.env.CURRENT_AGENT_ID;
        }
        
        // Generate a consistent ID for the action based on its details
        // This ensures that status updates for the same action use the same ID
        let actionId;
        
        // If the details contain a callId or transactionId, use that for consistency
        if (content.details && typeof content.details === 'object') {
          if ('callId' in content.details && content.details.callId) {
            actionId = `action-${content.details.callId}`;
          } else if ('transactionId' in content.details && content.details.transactionId) {
            actionId = `action-tx-${content.details.transactionId}`;
          } else if ('txHash' in content.details && content.details.txHash) {
            actionId = `action-tx-${content.details.txHash}`;
          } else {
            // Generate a unique ID that includes the action type for better traceability
            actionId = `action-${content.type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
          }
        } else {
          // Fallback to a timestamp-based ID
          actionId = `action-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        }
                
        const action = {
          id: actionId,
          agentId,
          type: content.type,
          displayName: createActionDisplayLabel(content.type, content.details),
          status: content.status,
          details: content.details,
          timestamp: Date.now(),
        };
        
        console.log(`Sending action to dashboard for agent: ${agentId}, type: ${content.type}, status: ${content.status}, id: ${actionId}`);
        
        await axios.post(`${DASHBOARD_URL}/api/actions`, {
          agentId,
          action,
        });
        
        // Also update agent status to executing if action is pending
        if (content.status === 'pending') {
          await axios.post(`${DASHBOARD_URL}/api/agents/${agentId}/status`, {
            status: 'executing',
          });
        }
      } catch (error: any) {
        // Silently fail if dashboard is not available
        console.error('Error sending action to dashboard:', error.message);
      }
    }
    
    return {
      data: content,
      timestamp: Date.now(),
    };
  },
});

/**
 * Dashboard output for updating agent status
 */
export const dashboardStatus = output({
  description: "Update agent status in the dashboard",
  schema: z.object({
    status: z.enum(['idle', 'thinking', 'executing']).describe("The agent status"),
  }),
  handler: async (content, ctx, agent?: any) => {
    // Only send to dashboard if enabled
    if (isDashboardEnabled) {
      try {
        // Try to get agent ID from context, agent object, or use a default
        let agentId = ctx.id || 'unknown-agent';
        
        // If agent object is available, try to get ID from there
        if (agent) {
          if (typeof agent === 'object') {
            if (agent.config && typeof agent.config === 'object' && 'id' in agent.config) {
              agentId = String(agent.config.id);
            } else if ('id' in agent) {
              agentId = String(agent.id);
            }
          }
        } else if (process.env.CURRENT_AGENT_ID) {
          // Fallback to environment variable
          agentId = process.env.CURRENT_AGENT_ID;
        }
        
        await axios.post(`${DASHBOARD_URL}/api/agents/${agentId}/status`, {
          status: content.status,
        });
      } catch (error: any) {
        // Silently fail if dashboard is not available
        console.error('Error updating agent status in dashboard:', error.message);
      }
    }
    
    return {
      data: content,
      timestamp: Date.now(),
    };
  },
}); 