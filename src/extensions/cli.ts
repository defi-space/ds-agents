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

export const cli = extension({
  name: "cli",
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