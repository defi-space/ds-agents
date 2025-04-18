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
 * Add a service provider for the prompts
 */
const promptsService = service({
  register(container) {
    container.singleton("prompts", () => ({
      START: PROMPTS.START,
      EXECUTION: PROMPTS.EXECUTION,
      UPDATE: PROMPTS.UPDATE,
      // Allow overriding prompts by environment variables
      ...(process.env.CUSTOM_PROMPTS ? JSON.parse(process.env.CUSTOM_PROMPTS) : {})
    }));
  },
  
  async boot(container) {
    const prompts = container.resolve<Record<string, string>>("prompts");
    console.log('Prompt service initialized with', Object.keys(prompts).length, 'prompts');
  }
});

/**
 * CLI extension configuration object that sets up the command line interface
 * Handles message input/output, system prompts, and periodic task execution
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
       * - Clears screen and shows header
       * - Sends initial strategic prompt
       * - Sets up periodic task execution and goal updates
       * @param {Function} send - Function to send messages
       * @param {Object} param1 - Container object
       * @returns {Function} Cleanup function
       */
      async subscribe(send, { container, emit }) {
        // Clear screen and show header
        clearScreen();
        displayHeader();
        
        console.log(chalk.cyan.bold('\nAutomated DS Agents System Started'));
        console.log(styles.separator);

        // Get the agent ID from environment variable
        const agentId = process.env.CURRENT_AGENT_ID || 'unknown-agent';
        console.log(`Agent ID: ${agentId}`);
        
        // Get prompts from the service
        const prompts = container.resolve<Record<string, string>>("prompts");

        // Add initial delay before sending first prompt
        await new Promise(resolve => setTimeout(resolve, 1000));

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
        const executionInterval = 5 * 60 * 1000;   // 5 minutes
        const updateInterval = 30 * 60 * 1000;      // 30 minutes
        
        // Set up separate timers for execution and updates
        setTimeout(() => {
          // Start execution cycle (every 5 minutes)
          const runExecutionCycle = () => {
            console.log(`${getTimestamp()} Running execution cycle`);
            
            // Emit event that execution cycle is starting
            const startTime = Date.now();
            emit("cycleStarted", { 
              cycleType: "execution", 
              timestamp: startTime 
            });
            
            // Send the execution prompt
            send(
              cliContext,
              { user: agentId },
              {
                user: agentId,
                text: prompts.EXECUTION,
              }
            );
            
            // Emit event that execution cycle completed after a delay
            setTimeout(() => {
              emit("cycleCompleted", {
                cycleType: "execution",
                timestamp: Date.now(),
                duration: Date.now() - startTime
              });
            }, 5000); // Assume completion after 5 seconds
            
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
            
            // Emit event that update cycle is starting
            const startTime = Date.now();
            emit("cycleStarted", { 
              cycleType: "update", 
              timestamp: startTime 
            });
            
            // Send the update prompt
            send(
              cliContext,
              { user: agentId },
              {
                user: agentId,
                text: prompts.UPDATE,
              }
            );
            
            // Emit event that update cycle completed after a delay
            setTimeout(() => {
              emit("cycleCompleted", {
                cycleType: "update",
                timestamp: Date.now(),
                duration: Date.now() - startTime
              });
            }, 5000); // Assume completion after 5 seconds
            
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
        // If content is a string, convert it to the expected format
        const message = typeof content === 'string' ? content : content.message;
        
        console.log(`${getTimestamp()} ${styles.agentLabel}: ${message}\n`);
        console.log(styles.separator + '\n');
        
        return {
          data: { message },
          timestamp: Date.now(),
        };
      },
      format: (outputRef) => {
        if (!outputRef) {
          return formatMsg({
            role: "assistant",
            content: "",
          });
        }
        
        // Handle both array and single output case
        const ref = Array.isArray(outputRef) ? outputRef[0] : outputRef;
        
        // Extract the content - either from data.message or from outputRef directly
        let message = "";
        if (ref && ref.data) {
          message = typeof ref.data === 'object' && ref.data.message ? ref.data.message : String(ref.data);
        }
        
        return formatMsg({
          role: "assistant",
          content: message,
        });
      },
    }),
  },
  
  // Add events that this extension can emit
  events: {
    // Define specific events that can be emitted
    cycleStarted: z.object({ 
      cycleType: z.enum(["execution", "update"]),
      timestamp: z.number()
    }).describe("Emitted when an execution or update cycle starts"),
    
    cycleCompleted: z.object({
      cycleType: z.enum(["execution", "update"]),
      timestamp: z.number(),
      duration: z.number()
    }).describe("Emitted when an execution or update cycle completes"),
    
    error: z.object({
      message: z.string(),
      timestamp: z.number()
    }).describe("Emitted when an error occurs in the autonomous CLI")
  },
  
  // Add install function
  async install(agent) {
    console.log(chalk.cyan('Installing Autonomous CLI extension...'));
    
    // One-time setup for the autonomous CLI
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nCaught interrupt signal. Shutting down autonomous mode...'));
      process.exit(0);
    });
  }
});
