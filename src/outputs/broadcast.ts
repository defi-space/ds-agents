import { output } from "@daydreamsai/core";
import { z } from "zod";
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { createServer } from 'net';

// Initialize environment variables
dotenv.config();

// Configuration
const shouldBroadcast = process.env.FRONTEND_BROADCAST === 'true';
const broadcastPort = Number(process.env.FRONTEND_WS_PORT || '8765');
const agentName = process.env.AGENT_NAME || 'unknown';
const DEBUG = 'false';

// WebSocket server instance - must be a single shared instance for all agents
let wss: WebSocketServer | null = null;
let serverInitialized = false;
let wsServerPort: number | null = null;

// Working memory collection state
let collectingJson: { [agentId: string]: boolean } = {};
let jsonBuffer: { [agentId: string]: string[] } = {};
let openBraces: { [agentId: string]: number } = {};

/**
 * Check if a port is in use
 */
const isPortInUse = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const testServer = createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        testServer.close();
        resolve(false);
      })
      .listen(port);
  });
};

/**
 * Log a message (only if debugging is enabled)
 */
function debugLog(message: string): void {
  if (DEBUG) {
    console.log(`[broadcast:${agentName}] ${message}`);
  }
}

/**
 * Log an error
 */
function errorLog(message: string, error?: any): void {
  console.error(`[broadcast:${agentName}] ${message}`, error || '');
}

/**
 * Initialize WebSocket server
 */
async function ensureWebSocketServer(): Promise<void> {
  if (!shouldBroadcast || serverInitialized) return;
  
  serverInitialized = true;
  
  try {
    const inUse = await isPortInUse(broadcastPort);
    
    if (inUse) {
      debugLog(`Port ${broadcastPort} is already in use. Using existing WebSocket server.`);
      wss = {} as WebSocketServer; // Dummy for client-only mode
      wsServerPort = broadcastPort;
      return;
    }
    
    debugLog(`Starting WebSocket server on port ${broadcastPort}`);
    
    wss = new WebSocketServer({ port: broadcastPort });
    wsServerPort = broadcastPort;
    
    wss.on('connection', (ws: WebSocket) => {
      debugLog('Client connected to WebSocket server');
      
      try {
        ws.send(JSON.stringify({
          type: 'connection_status',
          data: { status: 'connected' },
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        errorLog('Failed to send welcome message', e);
      }
      
      ws.on('close', () => debugLog('Client disconnected'));
      ws.on('error', (error) => errorLog('WebSocket client error', error));
    });
    
    wss.on('error', (error: Error) => {
      if ((error as any).code === 'EADDRINUSE') {
        debugLog('WebSocket server already running on port ' + broadcastPort);
        wss = {} as WebSocketServer;
      } else {
        errorLog('WebSocket server error', error);
      }
    });
    
    wss.on('listening', () => debugLog('WebSocket server successfully listening'));
  } catch (error) {
    errorLog('Failed to start WebSocket server', error);
    serverInitialized = false;
  }
}

/**
 * Broadcast a message to all connected clients
 */
function broadcastToFrontend(type: string, data: any): void {
  if (!shouldBroadcast) return;
  
  debugLog(`Broadcasting message of type: ${type}`);
  
  ensureWebSocketServer();
  
  if (!wsServerPort) {
    debugLog('WebSocket port not initialized yet');
    return;
  }
  
  const message = {
    type,
    data,
    timestamp: new Date().toISOString()
  };
  
  // If we don't own the server, send message through stdout for parent process
  if (!wss || !wss.clients) {
    console.log(`[WEBSOCKET_BROADCAST:${type}] ${JSON.stringify(message)}`);
    debugLog('Forwarded message to parent process');
    return;
  }
  
  // Check for connected clients
  const clients = wss.clients;
  if (!clients || clients.size === 0) {
    debugLog('No clients connected, message not sent directly');
    console.log(`[WEBSOCKET_BROADCAST:${type}] ${JSON.stringify(message)}`);
    return;
  }
  
  // Send to all connected clients
  const messageStr = JSON.stringify(message);
  let sentCount = 0;
  
  clients.forEach((client: WebSocket) => {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
        sentCount++;
      }
    } catch (error) {
      errorLog('Error sending message to client', error);
    }
  });
  
  debugLog(`Sent message to ${sentCount}/${clients.size} clients`);
}

/**
 * Extract agent ID from a log message
 */
function extractAgentId(msg: string): string | null {
  const match = msg.match(/\[(\w+):run\]/);
  return match ? match[1] : null;
}

/**
 * Extract agent ID from the beginning of a string with [agentX] format
 */
function extractExplicitAgentId(msg: string): string | null {
  const match = msg.match(/^\[(\w+)\]/);
  return match ? match[1] : null;
}

/**
 * Start collecting JSON for a specific agent
 */
function startJsonCollection(agentId: string): void {
  debugLog(`Starting JSON collection for ${agentId}`);
  collectingJson[agentId] = true;
  jsonBuffer[agentId] = [];
  openBraces[agentId] = 0;
}

/**
 * Process a line of JSON during collection
 */
function processJsonLine(agentId: string, line: string): void {
  if (!collectingJson[agentId]) return;

  // Count braces to determine when JSON is complete
  const openBracesInLine = (line.match(/\{/g) || []).length;
  const closeBracesInLine = (line.match(/\}/g) || []).length;
  
  openBraces[agentId] += openBracesInLine - closeBracesInLine;
  jsonBuffer[agentId].push(line);
  
  // Check if JSON collection is complete
  if (openBraces[agentId] <= 0 && jsonBuffer[agentId].length > 0) {
    finishJsonCollection(agentId);
  }
}

/**
 * Attempt to parse collected JSON and broadcast it
 */
function finishJsonCollection(agentId: string): void {
  if (!collectingJson[agentId] || !jsonBuffer[agentId] || jsonBuffer[agentId].length === 0) return;
  
  try {
    const jsonStr = jsonBuffer[agentId].join('\n');
    collectingJson[agentId] = false;
    
    const jsonMatch = jsonStr.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      debugLog(`No valid JSON found in collected buffer for ${agentId}`);
      jsonBuffer[agentId] = [];
      return;
    }
    
    const extractedJson = jsonMatch[1];
    
    try {
      const workingMemory = JSON.parse(extractedJson);
      debugLog(`Successfully parsed working memory JSON for ${agentId}`);
      
      broadcastToFrontend('working_memory', {
        agentId,
        workingMemory
      });
    } catch (parseError) {
      errorLog(`Error parsing JSON for ${agentId}`, parseError);
    }
  } catch (error) {
    errorLog(`Error processing collected JSON for ${agentId}`, error);
  } finally {
    jsonBuffer[agentId] = [];
  }
}

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

/**
 * Process console output for working memory logs
 */
function processConsoleOutput(args: any[]): void {
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] === 'string') {
      const line = args[i];
      
      // Check if this is the start of a working memory log
      if (line.includes('Saving working memory')) {
        const explicitAgentId = extractExplicitAgentId(line);
        const agentId = explicitAgentId || 
                        extractAgentId(line) || 
                        process.env.CURRENT_AGENT_ID || 
                        process.env.AGENT_NAME || 
                        'unknown';
        
        startJsonCollection(agentId);
        processJsonLine(agentId, line);
      } else {
        // Process ongoing JSON collection
        Object.keys(collectingJson).forEach(agentId => {
          if (collectingJson[agentId]) {
            const explicitAgentId = extractExplicitAgentId(line);
            if (!explicitAgentId || explicitAgentId === agentId) {
              processJsonLine(agentId, line);
            }
          }
        });
      }
    }
  }
}

// Override console methods to intercept working memory logs
console.log = function(...args) {
  originalConsoleLog.apply(this, args);
  processConsoleOutput(args);
};

console.info = function(...args) {
  originalConsoleInfo.apply(this, args);
  processConsoleOutput(args);
};

console.debug = function(...args) {
  originalConsoleDebug.apply(this, args);
  processConsoleOutput(args);
};

// Set up intervals
// Finalize incomplete JSON collection after timeout
setInterval(() => {
  Object.keys(collectingJson).forEach(agentId => {
    if (collectingJson[agentId] && jsonBuffer[agentId]?.length > 0) {
      debugLog(`JSON collection timed out for ${agentId}, attempting to parse`);
      finishJsonCollection(agentId);
    }
  });
}, 2000);

// Periodically ensure WebSocket server is initialized
setInterval(() => {
  if (shouldBroadcast && !serverInitialized) {
    debugLog('Periodic check: Initializing WebSocket server');
    ensureWebSocketServer();
  }
}, 30000);

// Initialize WebSocket server on module load
ensureWebSocketServer();

// Export the broadcast output handler
export const broadcastOutput = output({
  description: "Broadcasts agent working memory to the frontend via WebSocket.",
  instructions: "Send agent working memory to the frontend",
  enabled: () => shouldBroadcast,
  schema: z.object({
    content: z.string().describe("The content to broadcast"),
    type: z.string().describe("The type of content being broadcast"),
    agentId: z.string().optional().describe("The ID of the agent generating this content"),
  }),
  handler: async (data, ctx, agent) => {
    broadcastToFrontend(data.type, {
      content: data.content,
      agentId: data.agentId || 
               (agent as any)?.id || 
               ctx.id || 
               process.env.CURRENT_AGENT_ID || 
               process.env.AGENT_NAME || 
               'unknown',
      contextId: ctx.id || 'unknown',
    });

    return {
      data,
      timestamp: Date.now(),
    };
  },
}); 