import * as readline from "readline/promises";
import { context, extension, formatMsg, input, output, service } from "@daydreamsai/core";
import { z } from "zod";
import chalk from "chalk";
import { PROMPTS } from "../prompts";

/**
 * CLI context configuration
 * Defines the type and schema for CLI interactions
 */
const cliContext = context({
  type: "cli",
  key: ({ user }) => user.toString(),
  schema: z.object({ user: z.string() }),
});

/**
 * Styling configuration for CLI output
 * Defines colors and formatting for different message types
 */
const styles = {
  agentLabel: chalk.green.bold('Agent'),
  separator: chalk.gray('─'.repeat(50)),
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
 * Sets up the readline interface for handling user input/output
 */
const readlineService = service({
  register(container) {
    container.singleton("readline", () =>
      readline.createInterface({
        input: process.stdin,
        output: process.stdout,
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
 * CLI extension configuration object that sets up the command line interface
 * Handles message input/output, system prompts, and periodic task execution
 */
export const autonomousCli = extension({
  name: "autonomous-cli",
  services: [readlineService],
  contexts: {
    cli: cliContext,
  },
  inputs: {
    "cli:message": input({
      schema: z.object({
        user: z.string(),
        text: z.string(),
      }),
      format: ({ user, text }) =>
        formatMsg({
          role: "user",
          content: text,
          user,
        }),
      /**
       * Subscribes to CLI input and sets up the system
       * - Clears screen and shows header
       * - Sends initial strategic prompt
       * - Sets up periodic task execution and goal updates
       * @param {Function} send - Function to send messages
       * @param {Object} param1 - Container object
       * @returns {Function} Cleanup function
       */
      async subscribe(send, { container }) {
        // Clear screen and show header
        clearScreen();
        displayHeader();
        
        console.log(chalk.cyan.bold('\nAutomated DS Agents System Started'));
        console.log(styles.separator);

        // Get the agent ID from environment variable
        const agentId = process.env.CURRENT_AGENT_ID || 'unknown-agent';
        console.log(`Agent ID: ${agentId}`);

        // Add initial delay before sending first prompt
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Send initial strategic prompt
        send(
          cliContext,
          { user: agentId },
          {
            user: agentId,
            text: PROMPTS.START,
          }
        );

        // Define intervals for different operations
        const executionInterval = 5 * 60 * 1000;   // 5 minutes
        const updateInterval = 30 * 60 * 1000;      // 30 minutes
        
        // Set up separate timers for execution and updates
        setTimeout(() => {
          // Start execution cycle (every 5 minutes)
          const runExecutionCycle = () => {
            console.log(`${getTimestamp()} Running execution cycle`);
            
            // Send the execution prompt
            send(
              cliContext,
              { user: agentId },
              {
                user: agentId,
                text: PROMPTS.EXECUTION,
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
          const runUpdateCycle = () => {
            console.log(`${getTimestamp()} Running update cycle`);
            
            // Send the update prompt
            send(
              cliContext,
              { user: agentId },
              {
                user: agentId,
                text: PROMPTS.UPDATE,
              }
            );
            
            // Schedule the next update cycle
            setTimeout(runUpdateCycle, updateInterval);
          };
          
          // Start the first update cycle
          runUpdateCycle();
        }, updateInterval);

        // Keep the process running
        return () => {};
      },
    }),
  },
  outputs: {
    "cli:message": output({
      description: "Send messages to the user",
      schema: z.object({
        message: z.string().describe("The message to send"),
      }),
      handler(content, ctx, agent) {
        console.log(`${getTimestamp()} ${styles.agentLabel}: ${content.message}\n`);
        console.log(styles.separator + '\n');
        
        return {
          data: content,
          timestamp: Date.now(),
        };
      },
      format: ({ data }) =>
        formatMsg({
          role: "assistant",
          content: data.message,
        }),
    }),
  },
});
