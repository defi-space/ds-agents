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
 * Intercepts blockchain actions to send them to the dashboard
 * @param agent - The agent instance
 * @param actionType - The type of action being intercepted
 * @param originalHandler - The original handler function
 * @returns A wrapped handler function that sends action data to the dashboard
 */
const interceptBlockchainAction = (agent: any, actionType: string, originalHandler: Function) => {
  return async (call: any, ...args: any[]) => {
    // Get the context from args (typically the first argument after call)
    const ctx = args.length > 0 ? args[0] : {};
    
    // Get agent ID from environment variable if available
    let agentId = process.env.CURRENT_AGENT_ID || 'unknown-agent';
    
    // Try to get ID from agent config if available
    if (agent && typeof agent === 'object') {
      if ('config' in agent && agent.config && typeof agent.config === 'object' && 'id' in agent.config) {
        agentId = String(agent.config.id);
      }
    }
    
    // Create a context with the agent ID if not already present
    const contextWithId = ctx.id ? ctx : { ...ctx, id: agentId };
    
    // Send pending action to dashboard
    await agent.outputs["dashboard:action"].handler({
      type: actionType,
      status: "pending",
      details: call
    }, contextWithId, agent);
    
    try {
      // Call original handler
      const result = await originalHandler(call, ...args);
      
      // Send successful action to dashboard
      await agent.outputs["dashboard:action"].handler({
        type: actionType,
        status: "success",
        details: {
          ...call,
          result
        }
      }, contextWithId, agent);
      
      return result;
    } catch (error: any) {
      // Send failed action to dashboard
      await agent.outputs["dashboard:action"].handler({
        type: actionType,
        status: "failed",
        details: {
          ...call,
          error: error.message
        }
      }, contextWithId, agent);
      
      throw error;
    }
  };
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
  // Add install method to intercept blockchain actions
  install: async (agent: any) => {
    const isDashboardEnabled = process.env.ENABLE_DASHBOARD === 'true';
    
    // Log the agent ID and dashboard status
    const agentId = process.env.CURRENT_AGENT_ID || 
                   (agent && agent.config && agent.config.id) || 
                   (agent && agent.id) || 
                   'unknown-agent';
    
    console.log(`Installing autonomous-cli extension for agent: ${agentId}`);
    console.log(`Dashboard enabled: ${isDashboardEnabled}`);
    
    if (!isDashboardEnabled) {
      console.log('Dashboard is disabled, skipping action interception');
      return;
    }
    
    if (!agent || !agent.actions) {
      console.log('Agent or agent actions not available, skipping action interception');
      return;
    }
    
    if (!agent.outputs || !agent.outputs["dashboard:action"]) {
      console.log('Dashboard outputs not available, skipping action interception');
      return;
    }
    
    // Intercept blockchain actions
    const blockchainActionPrefixes = ['blockchain:'];
    let interceptedCount = 0;
    
    // Loop through all actions
    Object.keys(agent.actions).forEach(actionName => {
      // Check if it's a blockchain action
      if (blockchainActionPrefixes.some(prefix => actionName.startsWith(prefix))) {
        const action = agent.actions[actionName as keyof typeof agent.actions];
        if (action && action.handler && typeof action.handler === 'function') {
          const originalHandler = action.handler;
          // Replace handler with interceptor
          action.handler = interceptBlockchainAction(agent, actionName, originalHandler);
          interceptedCount++;
        }
      }
    });
    
    console.log(`Intercepted ${interceptedCount} blockchain actions for agent: ${agentId}`);
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

        // Track the last time UPDATE was sent
        let lastUpdateTime = 0;
        
        // Initial update after 60 seconds (1 minute)
        setTimeout(() => {
          send(
            cliContext,
            { user: agentId },
            {
              user: agentId,
              text: PROMPTS.UPDATE,
            }
          );
          
          lastUpdateTime = Date.now();
          
          // Start execution interval 60s (1 minute) after first UPDATE
          setTimeout(() => {
            // Set up the main interval that handles both EXECUTION and UPDATE
            setInterval(() => {
              const currentTime = Date.now();
              const timeSinceLastUpdate = currentTime - lastUpdateTime;
              
              // If it's been 5 minutes since the last UPDATE, send UPDATE
              if (timeSinceLastUpdate >= 300000) {
                send(
                  cliContext,
                  { user: agentId },
                  {
                    user: agentId,
                    text: PROMPTS.UPDATE,
                  }
                );
                lastUpdateTime = currentTime;
              } 
              // Otherwise send EXECUTION (but not if UPDATE was just sent)
              else {
                send(
                  cliContext,
                  { user: agentId },
                  {
                    user: agentId,
                    text: PROMPTS.EXECUTION,
                  }
                );
              }
            }, 60000); // Run every 1 minute
          }, 60000);
        }, 60000);

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
        
        // Also send to dashboard if available
        if (agent && agent.outputs && agent.outputs["dashboard:thought"]) {
          // Get agent ID from environment variable if available
          let agentId = process.env.CURRENT_AGENT_ID || 'unknown-agent';
          
          // Try to get ID from agent config if available
          if (agent && typeof agent === 'object') {
            if ('config' in agent && agent.config && typeof agent.config === 'object' && 'id' in agent.config) {
              agentId = String(agent.config.id);
            }
          }
          
          console.log(`Sending thought to dashboard for agent: ${agentId}`);
          
          // Create a context with the agent ID if not already present
          const contextWithId = ctx.id ? ctx : { ...ctx, id: agentId };
          
          agent.outputs["dashboard:thought"].handler({
            content: content.message
          }, contextWithId, agent);
        }
        
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
