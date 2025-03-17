import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import chalk from 'chalk';

// Parse command line arguments
const args = process.argv.slice(2);
let numAgentsToRun = 4; // Default to 4 agents

// Check if number of agents is specified
if (args.length > 0) {
  const parsedNum = parseInt(args[0], 10);
  if (!isNaN(parsedNum) && parsedNum >= 2 && parsedNum <= 4) {
    numAgentsToRun = parsedNum;
  } else {
    console.log(chalk.yellow(`Invalid number of agents specified. Using default (${numAgentsToRun}).`));
    console.log(chalk.yellow('Usage: bun run src/run-agents.ts [number of agents (2-4)]'));
  }
}

console.log(`Running ${chalk.bold(numAgentsToRun.toString())} agents`);

// More aesthetic color combinations using chalk
const colorStyles = [
  // Faction colors - one for each agent
  chalk.hex('#34A2DF').bold,          // Agent 1 - UC - United Coalition (Blue)
  chalk.hex('#dd513c').bold,          // Agent 2 - FS - Freehold of Syndicates (Red)
  chalk.hex('#FFFF84').bold,          // Agent 3 - CP - Celestial Priesthood (Yellow)
  chalk.hex('#2a9d8f').bold,          // Agent 4 - MWU - Mechanized Workers' Union (Teal)
];

// Function to get a consistent color for an agent
function getAgentColor(agentNumber: number): (text: string) => string {
  // Ensure agent number is valid (1-4), otherwise default to index 0
  const colorIndex = agentNumber < 1 || agentNumber > 4 
    ? 0 
    : agentNumber - 1;
    
  return colorStyles[colorIndex];
}

// Function to run an agent
function runAgent(agentNumber: number): ChildProcess {
  const agentName = `agent${agentNumber}`;
  const colorize = getAgentColor(agentNumber);
  
  console.log(`Starting ${colorize(agentName)}...`);
  
  // Use Bun to run the agent with the specified agent number
  const agentProcess = spawn('bun', ['run', '--no-warnings', path.join(__dirname, 'agents/agent.ts')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      AGENT_NAME: agentName,
      AGENT_NUMBER: agentNumber.toString(),
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
  
  // Create an array of agent numbers from 1 to numAgentsToRun
  const agentNumbers = Array.from({ length: numAgentsToRun }, (_, i) => i + 1);
  
  for (const agentNumber of agentNumbers) {
    const process = runAgent(agentNumber);
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