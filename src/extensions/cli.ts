import * as readline from "readline/promises";
import { z } from "zod";
import { context, extension, formatMsg, input, output, service } from "@daydreamsai/core";
import chalk from "chalk";

const cliContext = context({
  type: "cli",
  key: ({ user }) => user.toString(),
  schema: z.object({ user: z.string() }),
});

// CLI styling configuration
const styles = {
  prompt: chalk.blue.bold('You ⪧ '),
  userLabel: chalk.blue.bold('You'),
  agentLabel: chalk.green.bold('Agent'),
  separator: chalk.gray('─'.repeat(50)),
  errorText: chalk.red,
  exitCommand: chalk.yellow.italic('exit'),
  timestamp: chalk.gray,
  header: chalk.cyan.bold,
};

const clearScreen = () => {
  console.clear();
};

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

const getTimestamp = () => {
  return styles.timestamp(`[${new Date().toLocaleTimeString()}]`);
};

/**
 * Intercept blockchain actions to send to dashboard
 * @param {any} agent - The agent instance
 * @param {string} actionName - The name of the action
 * @param {Function} originalHandler - The original action handler
 * @returns {Function} The intercepted action handler
 */
const interceptBlockchainAction = (agent: any, actionName: string, originalHandler: Function) => {
  return async (call: any, ...args: any[]) => {
    // Only intercept if dashboard is enabled
    const isDashboardEnabled = process.env.ENABLE_DASHBOARD === 'true';
    if (!isDashboardEnabled || !agent || !agent.outputs || !agent.outputs["dashboard:action"]) {
      return originalHandler(call, ...args);
    }
    
    const ctx = args[0] || {};
    const actionType = actionName.split(':')[1]?.toUpperCase() || actionName;
    
    try {
      // Send pending action to dashboard
      await agent.outputs["dashboard:action"].handler({
        type: actionType,
        status: "pending",
        details: call
      }, ctx, agent);
      
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
      }, ctx, agent);
      
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
      }, ctx, agent);
      
      throw error;
    }
  };
};

export const cli = extension({
  name: "cli",
  services: [readlineService],
  contexts: {
    cli: cliContext,
  },
  // Add install method to intercept blockchain actions
  install: async (agent: any) => {
    const isDashboardEnabled = process.env.ENABLE_DASHBOARD === 'true';
    if (!isDashboardEnabled || !agent || !agent.actions) return;
    
    // Intercept blockchain actions
    const blockchainActionPrefixes = ['blockchain:'];
    
    // Loop through all actions
    Object.keys(agent.actions).forEach(actionName => {
      // Check if it's a blockchain action
      if (blockchainActionPrefixes.some(prefix => actionName.startsWith(prefix))) {
        const action = agent.actions[actionName as keyof typeof agent.actions];
        if (action && action.handler && typeof action.handler === 'function') {
          const originalHandler = action.handler;
          // Replace handler with interceptor
          action.handler = interceptBlockchainAction(agent, actionName, originalHandler);
        }
      }
    });
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
      async subscribe(send, { container }) {
        const rl = container.resolve<readline.Interface>("readline");
        const controller = new AbortController();

        // Clear screen and show header
        clearScreen();
        displayHeader();
        
        console.log(chalk.cyan.bold('\nWelcome to the DS Agents CLI!'));
        console.log(styles.separator);
        console.log(chalk.gray(`Type ${styles.exitCommand} to quit\n`));

        new Promise<void>(async (resolve) => {
          while (!controller.signal.aborted) {
            const question = await rl.question(styles.prompt);
            
            if (question.toLowerCase() === 'exit') {
              console.log(chalk.yellow('\nGoodbye! 👋\n'));
              break;
            }

            console.log(`${getTimestamp()} ${styles.userLabel}: ${question}\n`);
            
            send(
              cliContext,
              { user: "admin" },
              {
                user: "admin",
                text: question,
              }
            );
          }

          resolve();
        });

        return () => {
          controller.abort();
        };
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
          agent.outputs["dashboard:thought"].handler({
            content: content.message
          }, ctx, agent);
        }
        
        // Add a small delay to ensure prompt appears after all logs
        setTimeout(() => {
          process.stdout.write(styles.prompt);
        }, 100);
        
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