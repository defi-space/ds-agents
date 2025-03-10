import { captureAgentThink, captureAgentAction } from '../outputs/dashboard';

/**
 * Check if an action is a blockchain invocation
 * @param actionData The action data to check
 * @returns True if the action is a blockchain invocation, false otherwise
 */
function isBlockchainAction(actionData: any): boolean {
  if (!actionData) return false;
  
  // Check action name for blockchain-related keywords
  const actionName = actionData.actionName || '';
  const blockchainKeywords = [
    'swap', 'deposit', 'withdraw', 'stake', 'unstake', 'claim', 'transfer',
    'mint', 'burn', 'approve', 'invoke', 'execute', 'call', 'transaction'
  ];
  
  // Check if action name contains any blockchain keywords
  const hasBlockchainKeyword = blockchainKeywords.some(keyword => 
    actionName.toLowerCase().includes(keyword)
  );
  
  // Check if the action has blockchain-specific properties
  const hasBlockchainProps = 
    (actionData.contractAddress !== undefined) ||
    (actionData.txHash !== undefined) ||
    (actionData.transaction !== undefined) ||
    (actionData.calldata !== undefined) ||
    (actionData.abi !== undefined) ||
    (actionData.fromToken !== undefined && actionData.toToken !== undefined);
  
  return hasBlockchainKeyword || hasBlockchainProps;
}

/**
 * Intercepts console.log calls to capture agent:think and agent:action logs
 * and forward them to the dashboard
 */
export function setupLogInterceptor() {
  // Store the original console.log function
  const originalConsoleLog = console.log;
  
  // Override console.log to intercept agent logs
  console.log = function(...args: any[]) {
    // Call the original console.log
    originalConsoleLog.apply(console, args);
    
    // Check if this is an agent log
    try {
      const logString = args[0];
      
      if (typeof logString !== 'string') return;
      
      // Check for agent:think logs in different formats
      if (logString.includes('[DEBUG] [agent:think]') || logString.includes('[agent:think]')) {
        // Extract the JSON data
        let thoughtData = null;
        
        // Try to find the thought data in the arguments
        const dataIndex = args.findIndex(arg => 
          typeof arg === 'object' && 
          arg !== null && 
          'ref' in arg && 
          arg.ref === 'thought'
        );
        
        if (dataIndex >= 0) {
          thoughtData = args[dataIndex];
        } else {
          // Try to extract JSON from the log string
          const jsonMatch = logString.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const jsonData = JSON.parse(jsonMatch[0]);
              if (jsonData.ref === 'thought') {
                thoughtData = jsonData;
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
        
        if (thoughtData) {
          captureAgentThink({ 
            data: thoughtData
          });
        }
      }
      
      // Check for agent:action logs in different formats
      if (logString.includes('[DEBUG] [agent:action]') || logString.includes('[agent:action]')) {
        // Extract the action data
        let actionData = null;
        
        // Try to find the action data in the arguments
        const dataIndex = args.findIndex(arg => 
          typeof arg === 'object' && 
          arg !== null && 
          (
            ('actionName' in arg && 'callId' in arg && 'contextId' in arg) ||
            ('actionName' in arg && 'callId' in arg)
          )
        );
        
        if (dataIndex >= 0) {
          actionData = args[dataIndex];
        } else {
          // Try to extract JSON from the log string
          const jsonMatch = logString.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const jsonData = JSON.parse(jsonMatch[0]);
              if (jsonData.actionName) {
                actionData = jsonData;
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
        
        // Only capture blockchain-related actions
        if (actionData && isBlockchainAction(actionData)) {
          captureAgentAction({ 
            data: actionData
          });
        }
      }
    } catch (error) {
      // Silently fail if there's an error in the interceptor
      // This ensures we don't break normal logging
    }
  };
  
  // Also intercept console.error to catch error logs
  const originalConsoleError = console.error;
  
  console.error = function(...args: any[]) {
    // Call the original console.error
    originalConsoleError.apply(console, args);
    
    // Check if this is an agent error log
    try {
      const logString = args[0];
      
      if (typeof logString !== 'string') return;
      
      // Check for agent:action error logs
      if (logString.includes('[ERROR] [agent:action]') || logString.includes('[agent:action]')) {
        // Extract the action data
        let actionData = null;
        
        // Try to find the action data in the arguments
        const dataIndex = args.findIndex(arg => 
          typeof arg === 'object' && 
          arg !== null
        );
        
        if (dataIndex >= 0) {
          actionData = args[dataIndex];
        } else {
          // Try to extract JSON from the log string
          const jsonMatch = logString.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const jsonData = JSON.parse(jsonMatch[0]);
              actionData = jsonData;
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
        
        // Only capture blockchain-related actions
        if (actionData && isBlockchainAction(actionData)) {
          captureAgentAction({ 
            data: {
              ...actionData,
              status: 'failed'
            }
          });
        }
      }
    } catch (error) {
      // Silently fail if there's an error in the interceptor
    }
  };
}

/**
 * Parse a log line to extract agent:think and agent:action data
 * This can be used to process log lines from files or streams
 * @param logLine The log line to parse
 */
export function parseAgentLogLine(logLine: string): { type: string, data: any } | null {
  try {
    // Check if this is an agent log
    if (!logLine.includes('[agent:think]') && !logLine.includes('[agent:action]')) {
      return null;
    }
    
    // Extract the JSON data
    const jsonMatch = logLine.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    let jsonData;
    try {
      jsonData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return null;
    }
    
    // Determine the log type
    let type = 'unknown';
    if (logLine.includes('[agent:think]')) {
      type = 'think';
    } else if (logLine.includes('[agent:action]')) {
      type = 'action';
    }
    
    return {
      type,
      data: jsonData
    };
  } catch (error) {
    return null;
  }
}

/**
 * Process a parsed agent log and send it to the dashboard
 * @param parsedLog The parsed log data
 */
export function processAgentLog(parsedLog: { type: string, data: any }) {
  if (!parsedLog) return;
  
  if (parsedLog.type === 'think') {
    captureAgentThink({ 
      data: parsedLog.data
    });
  } else if (parsedLog.type === 'action' && isBlockchainAction(parsedLog.data)) {
    captureAgentAction({ 
      data: parsedLog.data
    });
  }
} 