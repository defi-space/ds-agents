import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

// Parse command line arguments
const args = process.argv.slice(2);
let numAgentsToRun = 7; // Default to 7 agents

// Check if number of agents is specified
if (args.length > 0) {
  const parsedNum = parseInt(args[0], 10);
  if (!isNaN(parsedNum) && parsedNum >= 2 && parsedNum <= 7) {
    numAgentsToRun = parsedNum;
  } else {
    console.log(chalk.yellow(`Invalid number of agents specified. Using default (${numAgentsToRun}).`));
    console.log(chalk.yellow('Usage: bun run src/run-agents.ts [number of agents (2-7)]'));
  }
}

// Get all agent files
const agentsDir = path.join(__dirname, 'agents');
const allAgentFiles = fs.readdirSync(agentsDir)
  .filter(file => file.startsWith('agent') && file.endsWith('.ts') && !file.includes('common'));

// Sort agent files by number to ensure we run them in order (agent1, agent2, etc.)
allAgentFiles.sort((a, b) => {
  const numA = parseInt(a.replace('agent', '').replace('.ts', ''), 10);
  const numB = parseInt(b.replace('agent', '').replace('.ts', ''), 10);
  return numA - numB;
});

// Limit to the specified number of agents
const agentFiles = allAgentFiles.slice(0, numAgentsToRun);

console.log(`Running ${chalk.bold(agentFiles.length.toString())} out of ${chalk.bold(allAgentFiles.length.toString())} available agents`);

// More aesthetic color combinations using chalk
const colorStyles = [
  // Faction colors - one for each agent
  chalk.hex('#34A2DF').bold,          // Agent 1 - UC - United Coalition (Blue)
  chalk.hex('#dd513c').bold,          // Agent 2 - FS - Freehold of Syndicates (Red)
  chalk.hex('#FFFF84').bold,          // Agent 3 - CP - Celestial Priesthood (Yellow)
  chalk.hex('#2a9d8f').bold,          // Agent 4 - MWU - Mechanized Workers' Union (Teal)
  chalk.hex('#4DDCFF').bold,          // Agent 5 - SO - Scientific Order (Light Blue)
  chalk.hex('#ffb78a').bold,          // Agent 6 - ES - Esoteric Syndicate (Peach)
  chalk.hex('#3df2ad').bold,          // Agent 7 - TG - Technomancers' Guild (Mint Green)
];

// Function to get a consistent color for an agent
function getAgentColor(agentName: string): (text: string) => string {
  // Extract agent number from name (e.g., "agent1" -> 1)
  const agentNumber = parseInt(agentName.replace('agent', ''), 10);
  
  // Ensure agent number is valid (1-7), otherwise default to index 0
  const colorIndex = isNaN(agentNumber) || agentNumber < 1 || agentNumber > 7 
    ? 0 
    : agentNumber - 1;
    
  return colorStyles[colorIndex];
}

// Function to run an agent
function runAgent(agentFile: string): ChildProcess {
  const agentPath = path.join(agentsDir, agentFile);
  const agentName = agentFile.replace('.ts', '');
  const colorize = getAgentColor(agentName);
  
  console.log(`Starting ${colorize(agentName)}...`);
  
  // Extract agent number from filename (e.g., "agent1.ts" -> "1")
  const agentNumber = agentName.replace('agent', '');
  
  // Use Bun to run the agent with unbuffered output
  const agentProcess = spawn('bun', ['run', '--no-warnings', agentPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      AGENT_NAME: agentName,
      CURRENT_AGENT_ID: `agent-${agentNumber}`, // Set the agent ID explicitly
      ENABLE_DASHBOARD: 'true', // Enable dashboard integration
      FORCE_COLOR: '1', // Force colored output
      NODE_OPTIONS: '--no-warnings' // Suppress Node.js warnings
    }
  });
  
  // Log output with agent name prefix - ensure immediate flushing
  agentProcess.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line: string) => {
      if (line.trim()) {
        console.log(`${colorize(`[${agentName}]`)} ${line}`);
      }
    });
  });
  
  agentProcess.stderr.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line: string) => {
      if (line.trim()) {
        console.error(`${colorize(`[${agentName}] ERROR:`)} ${line}`);
      }
    });
  });
  
  agentProcess.on('close', (code: number | null) => {
    console.log(`${colorize(`[${agentName}]`)} exited with code ${code !== 0 ? chalk.red(code?.toString() || 'unknown') : chalk.green(code?.toString() || '0')}`);
  });
  
  return agentProcess;
}

// Run agents simultaneously without delay
async function runAgentsSimultaneously() {
  const processes: ChildProcess[] = [];
  
  for (const file of agentFiles) {
    const process = runAgent(file);
    processes.push(process);
  }
  
  return processes;
}

// Run all agents without delay
let processes: ChildProcess[] = [];
runAgentsSimultaneously().then(procs => {
  processes = procs;
  console.log(chalk.bold.green('✓') + chalk.bold(` All ${numAgentsToRun} agents are running. Press Ctrl+C to stop.`));
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\nShutting down all agents...'));
  processes.forEach(proc => {
    if (!proc.killed) {
      proc.kill('SIGINT');
    }
  });
}); 