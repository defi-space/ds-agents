import * as readline from "node:readline/promises";
import { context, extension, formatMsg, input, output, service, z } from "@daydreamsai/core";
import chalk from "chalk";
import { PROMPTS } from "../prompts";
import { checkGameSessionActiveOrExit } from "../utils/graphql";

/**
 * CLI context configuration
 * Defines the type and schema for CLI interactions
 */
const cliContext = context({
  type: "cli",
  key: ({ user }) => user.toString(),
  schema: z.object({ user: z.string() }),
  outputs: {
    "cli:message": output({
      description: "Send messages to the user",
      instructions: "Use plain text",
      schema: z.string(),
      handler(data) {
        console.log(`${getTimestamp()} ${styles.agentLabel}:`, data);
        return {
          data,
        };
      },
      examples: [
        `<output type="cli:message">Analyzing market conditions and executing trading strategy...</output>`,
      ],
    }),
  },
});

/**
 * Styling configuration for CLI output
 * Defines colors and formatting for different message types
 */
const styles = {
  agentLabel: chalk.green.bold("Agent"),
  separator: chalk.gray("─".repeat(50)),
  timestamp: chalk.gray,
  header: chalk.cyan.bold,
};

/**
 * Clears the terminal screen
 */
const clearScreen = () => {
  console.clear();
};

/**
 * Displays the ASCII art header for the DS Agents system
 */
const displayHeader = () => {
  const header = `

·▄▄▄▄  .▄▄ ·      ▄▄▄·  ▄▄ • ▄▄▄ . ▐ ▄ ▄▄▄▄▄.▄▄ · 
██▪ ██ ▐█ ▀.     ▐█ ▀█ ▐█ ▀ ▪▀▄.▀·•█▌▐█•██  ▐█ ▀. 
▐█· ▐█▌▄▀▀▀█▄    ▄█▀▀█ ▄█ ▀█▄▐▀▀▪▄▐█▐▐▌ ▐█.▪▄▀▀▀█▄
██. ██ ▐█▄▪▐█    ▐█ ▪▐▌▐█▄▪▐█▐█▄▄▌██▐█▌ ▐█▌·▐█▄▪▐█
▀▀▀▀▀•  ▀▀▀▀      ▀  ▀ ·▀▀▀▀  ▀▀▀ ▀▀ █▪ ▀▀▀  ▀▀▀▀    

`;
  console.log(styles.header(header));
};

/**
 * Readline service configuration
 * Sets up the readline interface for handling user input
 */
const readlineService = service({
  register(container) {
    container.singleton("readline", () =>
      readline.createInterface({
        input: process.stdin,
      })
    );
  },
});

/**
 * Gets the current timestamp formatted with styling
 * @returns {string} Formatted timestamp string with styling
 */
const getTimestamp = () => {
  return styles.timestamp(`[${new Date().toLocaleTimeString()}]`);
};

/**
 * Add a service provider for the prompts
 */
const promptsService = service({
  register(container) {
    container.singleton("prompts", () => ({
      START: PROMPTS.START,
      EXECUTION: PROMPTS.EXECUTION,
      UPDATE: PROMPTS.UPDATE,
    }));
  },

  async boot(container) {
    const prompts = container.resolve<Record<string, string>>("prompts");
    console.log("Prompt service initialized with", Object.keys(prompts).length, "prompts");
  },
});

/**
 * CLI extension configuration object that sets up the command line interface
 * Handles message input, system prompts, and periodic task execution
 */
export const autonomousCli = extension({
  name: "autonomous-cli",
  services: [readlineService, promptsService],
  contexts: {
    cli: cliContext,
  },
  inputs: {
    "cli:message": input({
      schema: z.object({
        user: z.string(),
        text: z.string(),
      }),
      format: (inputRef) =>
        formatMsg({
          role: "user",
          content: inputRef.data.text,
          user: inputRef.data.user,
        }),
      /**
       * Subscribes to CLI input and sets up the system
       * - Checks if game session is active (exits if not)
       * - Clears screen and shows header
       * - Sends initial strategic prompt
       * - Sets up periodic task execution and goal updates
       * @param {Function} send - Function to send messages
       * @param {Object} param1 - Container object
       * @returns {Function} Cleanup function
       */
      async subscribe(send, { container }) {
        // Check if game session is active before starting
        await checkGameSessionActiveOrExit();

        // Clear screen and show header
        clearScreen();
        displayHeader();

        console.log(chalk.cyan.bold("\nAutomated DS Agents System Started"));
        console.log(styles.separator);

        // Get the agent ID from environment variable
        const agentId = process.env.CURRENT_AGENT_ID || "unknown-agent";
        console.log(`Agent ID: ${agentId}`);

        // Get prompts from the service
        const prompts = container.resolve<Record<string, string>>("prompts");

        // Add initial delay before sending first prompt
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send initial strategic prompt
        send(
          cliContext,
          { user: agentId },
          {
            user: agentId,
            text: prompts.START,
          }
        );

        // Define intervals for different operations
        const executionInterval = 5 * 60 * 1000; // 5 minutes
        const updateInterval = 30 * 60 * 1000; // 30 minutes

        // Set up separate timers for execution and updates
        setTimeout(() => {
          // Start execution cycle (every 5 minutes)
          const runExecutionCycle = async () => {
            console.log(`${getTimestamp()} Running execution cycle`);

            await checkGameSessionActiveOrExit();

            // Send the execution prompt
            send(
              cliContext,
              { user: agentId },
              {
                user: agentId,
                text: prompts.EXECUTION,
              }
            );

            // Schedule the next execution cycle
            setTimeout(runExecutionCycle, executionInterval);
          };

          // Start the first execution cycle
          runExecutionCycle();
        }, executionInterval);

        setTimeout(() => {
          // Start update cycle (every 30 minutes)
          const runUpdateCycle = async () => {
            console.log(`${getTimestamp()} Running update cycle`);

            await checkGameSessionActiveOrExit();

            // Send the update prompt
            send(
              cliContext,
              { user: agentId },
              {
                user: agentId,
                text: prompts.UPDATE,
              }
            );

            // Schedule the next update cycle
            setTimeout(runUpdateCycle, updateInterval);
          };

          // Start the first update cycle
          runUpdateCycle();
        }, updateInterval);

        // Keep the process running
        return () => {
          // This is an intentionally empty cleanup function since we want the process to keep running
        };
      },
    }),
  },
});
