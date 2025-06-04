import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import chalk from "chalk";

// Configuration
const DEFAULT_NUM_AGENTS = 4;
const MIN_AGENTS = 1;
const MAX_AGENTS = 4;

// Faction colors for agent output
const colorStyles = [
  // Faction colors - one for each agent
  chalk.hex("#34A2DF").bold, // Agent 1 - UC - United Coalition (Blue)
  chalk.hex("#dd513c").bold, // Agent 2 - FS - Freehold of Syndicates (Red)
  chalk.hex("#FFFF84").bold, // Agent 3 - CP - Celestial Priesthood (Yellow)
  chalk.hex("#2a9d8f").bold, // Agent 4 - MWU - Mechanized Workers' Union (Teal)
];

/**
 * Parse command line arguments to determine number of agents to run
 */
function parseCommandLineArgs(): number {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return DEFAULT_NUM_AGENTS;
  }

  const parsedNum = Number.parseInt(args[0], 10);

  if (!Number.isNaN(parsedNum) && parsedNum >= MIN_AGENTS && parsedNum <= MAX_AGENTS) {
    return parsedNum;
  }

  console.log(
    chalk.yellow(`Invalid number of agents specified. Using default (${DEFAULT_NUM_AGENTS}).`)
  );
  console.log(
    chalk.yellow(
      `Usage: bun run src/run-agents.ts [number of agents (${MIN_AGENTS}-${MAX_AGENTS})]`
    )
  );
  return DEFAULT_NUM_AGENTS;
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

  const agentProcess = spawn(
    "bun",
    ["run", "--no-warnings", path.join(__dirname, "agents/agent.ts")],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        AGENT_NAME: agentName,
        AGENT_NUMBER: agentNumber.toString(),
        CURRENT_AGENT_ID: `agent-${agentNumber}`,
        FORCE_COLOR: "1",
        NODE_OPTIONS: "--no-warnings",
      },
    }
  );

  // Process agent output
  agentProcess.stdout.on("data", (data: Buffer) => {
    const text = data.toString();
    const lines = text.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      // Regular log output
      console.log(`${colorize(`[${agentName}]`)} ${line}`);
    }
  });

  // Process agent errors
  agentProcess.stderr.on("data", (data: Buffer) => {
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        console.error(`${colorize(`[${agentName}] ERROR:`)} ${line}`);
      }
    }
  });

  // Handle agent exit
  agentProcess.on("close", (code: number | null) => {
    const exitCode = code === null ? "unknown" : code.toString();
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
 * Main function to run everything
 */
async function main() {
  // Parse command line arguments
  const numAgentsToRun = parseCommandLineArgs();
  console.log(
    `Running ${chalk.bold(numAgentsToRun.toString())} agent${numAgentsToRun > 1 ? "s" : ""}`
  );

  // Start all agents
  await runAgentsSimultaneously(numAgentsToRun);
  console.log(
    chalk.bold.green("✓") +
      chalk.bold(` All ${numAgentsToRun} agents are running. Press Ctrl+C to stop.`)
  );
}

// Start the application
main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
