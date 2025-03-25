import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import chalk from 'chalk';
import { WebSocketServer, WebSocket } from 'ws';

// Configuration
const DEFAULT_NUM_AGENTS = 4;
const MIN_AGENTS = 1;
const MAX_AGENTS = 4;
const broadcastPort = 8765; // Hardcoded WebSocket port
const shouldBroadcast = process.env.FRONTEND_BROADCAST === 'true';

// Faction colors for agent output
const colorStyles = [
  // Faction colors - one for each agent
  chalk.hex('#34A2DF').bold,          // Agent 1 - UC - United Coalition (Blue)
  chalk.hex('#dd513c').bold,          // Agent 2 - FS - Freehold of Syndicates (Red)
  chalk.hex('#FFFF84').bold,          // Agent 3 - CP - Celestial Priesthood (Yellow)
  chalk.hex('#2a9d8f').bold,          // Agent 4 - MWU - Mechanized Workers' Union (Teal)
];

// WebSocket server for broadcasting
let wss: WebSocketServer | null = null;

/**
 * Parse command line arguments to determine number of agents to run
 */
function parseCommandLineArgs(): number {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return DEFAULT_NUM_AGENTS;
  }
  
  const parsedNum = parseInt(args[0], 10);
  
  if (!isNaN(parsedNum) && parsedNum >= MIN_AGENTS && parsedNum <= MAX_AGENTS) {
    return parsedNum;
  }
  
  console.log(chalk.yellow(`Invalid number of agents specified. Using default (${DEFAULT_NUM_AGENTS}).`));
  console.log(chalk.yellow(`Usage: bun run src/run-agents.ts [number of agents (${MIN_AGENTS}-${MAX_AGENTS})]`));
  return DEFAULT_NUM_AGENTS;
}

/**
 * Initialize the WebSocket server for broadcasting
 * @returns Promise that resolves once server is initialized
 */
async function initializeWebSocketServer(): Promise<void> {
  if (!shouldBroadcast) {
    return;
  }

  try {
    console.log(chalk.blue(`Starting central WebSocket server on port ${broadcastPort}...`));
    
    wss = new WebSocketServer({ port: broadcastPort });
    
    return new Promise((resolve) => {
      wss!.on('connection', (ws: WebSocket) => {
        console.log(chalk.blue('Client connected to central WebSocket server'));
        
        ws.on('close', () => {
          console.log(chalk.blue('Client disconnected from central WebSocket server'));
        });
        
        ws.on('error', (error: Error) => {
          console.error(chalk.red('WebSocket client error:'), error);
        });
        
        // Send a welcome message
        ws.send(JSON.stringify({
          type: 'connection_status',
          data: { status: 'connected to central server' },
          timestamp: new Date().toISOString()
        }));
      });
      
      wss!.on('error', (error: Error) => {
        console.error(chalk.red('WebSocket server error:'), error);
        wss = null;
      });
      
      wss!.on('listening', () => {
        console.log(chalk.green('✓ Central WebSocket server started successfully'));
        resolve();
      });
    });
  } catch (error) {
    console.error(chalk.red('Failed to start central WebSocket server:'), error);
  }
}

/**
 * Broadcast a message to all connected WebSocket clients
 */
function broadcastMessage(data: any): void {
  if (!wss || !wss.clients || wss.clients.size === 0) return;
  
  const messageStr = JSON.stringify(data);
  let sentCount = 0;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
        sentCount++;
      } catch (error) {
        console.error(chalk.red('Error sending message to client:'), error);
      }
    }
  });
  
  if (sentCount > 0 && data.type === 'working_memory') {
    const agentId = data.data?.agentId || 'unknown';
    console.log(chalk.gray(`[broadcast] Sent working memory from ${agentId} to ${sentCount} clients`));
  }
}

/**
 * Get a consistent color for an agent
 */
function getAgentColor(agentNumber: number): (text: string) => string {
  const colorIndex = Math.max(0, Math.min(colorStyles.length - 1, agentNumber - 1));
  return colorStyles[colorIndex];
}

/**
 * Run a single agent process
 */
function runAgent(agentNumber: number): ChildProcess {
  const agentName = `agent${agentNumber}`;
  const colorize = getAgentColor(agentNumber);
  
  console.log(`Starting ${colorize(agentName)}...`);
  
  const agentProcess = spawn('bun', ['run', '--no-warnings', path.join(__dirname, 'agents/agent.ts')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      AGENT_NAME: agentName,
      AGENT_NUMBER: agentNumber.toString(),
      CURRENT_AGENT_ID: `agent-${agentNumber}`,
      FORCE_COLOR: '1',
      NODE_OPTIONS: '--no-warnings'
    }
  });
  
  // Process agent output
  agentProcess.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line: string) => {
      if (!line.trim()) return;
      
      // Check if this is a WebSocket broadcast message
      const broadcastMatch = line.match(/\[WEBSOCKET_BROADCAST:(\w+)\] (.*)/);
      if (broadcastMatch && wss) {
        try {
          const messageType = broadcastMatch[1];
          const jsonData = JSON.parse(broadcastMatch[2]);
          
          // Forward the message to all connected clients
          broadcastMessage(jsonData);
        } catch (error) {
          console.error(colorize(`[${agentName}] ERROR:`), 'Failed to forward WebSocket message:', error);
        }
      } else {
        // Regular log output
        console.log(`${colorize(`[${agentName}]`)} ${line}`);
      }
    });
  });
  
  // Process agent errors
  agentProcess.stderr.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line: string) => {
      if (line.trim()) {
        console.error(`${colorize(`[${agentName}] ERROR:`)} ${line}`);
      }
    });
  });
  
  // Handle agent exit
  agentProcess.on('close', (code: number | null) => {
    const exitCode = code === null ? 'unknown' : code.toString();
    const formattedCode = code !== 0 ? chalk.red(exitCode) : chalk.green(exitCode);
    console.log(`${colorize(`[${agentName}]`)} exited with code ${formattedCode}`);
  });
  
  return agentProcess;
}

/**
 * Run multiple agents simultaneously
 */
async function runAgentsSimultaneously(numAgents: number): Promise<ChildProcess[]> {
  const processes: ChildProcess[] = [];
  
  // Create an array of agent numbers from 1 to numAgents
  const agentNumbers = Array.from({ length: numAgents }, (_, i) => i + 1);
  
  for (const agentNumber of agentNumbers) {
    const process = runAgent(agentNumber);
    processes.push(process);
  }
  
  return processes;
}

/**
 * Gracefully shut down all processes
 */
function setupGracefulShutdown(processes: ChildProcess[]): void {
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down all agents...'));
    
    // Close WebSocket server if it exists
    if (wss) {
      console.log(chalk.blue('Closing WebSocket server...'));
      wss.close();
    }
    
    // Kill all agent processes
    processes.forEach(proc => {
      if (!proc.killed) {
        proc.kill('SIGINT');
      }
    });
  });
}

/**
 * Main function to run everything
 */
async function main() {
  // Parse command line arguments
  const numAgentsToRun = parseCommandLineArgs();
  console.log(`Running ${chalk.bold(numAgentsToRun.toString())} agent${numAgentsToRun > 1 ? 's' : ''}`);
  
  // Initialize WebSocket server if broadcasting is enabled
  if (shouldBroadcast) {
    await initializeWebSocketServer();
  }
  
  // Start all agents
  const processes = await runAgentsSimultaneously(numAgentsToRun);
  console.log(chalk.bold.green('✓') + chalk.bold(` All ${numAgentsToRun} agents are running. Press Ctrl+C to stop.`));
  
  // Setup graceful shutdown
  setupGracefulShutdown(processes);
}

// Start the application
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
}); 