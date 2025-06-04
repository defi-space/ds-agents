import * as readline from "node:readline/promises";
import { context, extension, formatMsg, input, output, service, z } from "@daydreamsai/core";
import chalk from "chalk";

const cliContext = context({
  type: "cli",
  key: ({ user }) => user.toString(),
  schema: z.object({ user: z.string() }),
});

// CLI styling configuration
const styles = {
  prompt: chalk.blue.bold("You ⪧ "),
  userLabel: chalk.blue.bold("You"),
  agentLabel: chalk.green.bold("Agent"),
  separator: chalk.gray("─".repeat(50)),
  errorText: chalk.red,
  exitCommand: chalk.yellow.italic("exit"),
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

  // Add boot phase to initialize the readline service
  async boot(container) {
    const rl = container.resolve<readline.Interface>("readline");
    // Configure readline with custom handling
    rl.on("SIGINT", () => {
      console.log(chalk.yellow("\nCaught interrupt signal. Exiting gracefully..."));
      process.exit(0);
    });

    console.log("CLI readline service initialized");
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
      format: (inputRef) => {
        if (!inputRef || !inputRef.data) {
          return formatMsg({
            role: "user",
            content: "",
            user: "unknown",
          });
        }

        return formatMsg({
          role: "user",
          content: inputRef.data.text,
          user: inputRef.data.user,
        });
      },
      async subscribe(send, { container }) {
        const rl = container.resolve<readline.Interface>("readline");
        const controller = new AbortController();

        // Clear screen and show header
        clearScreen();
        displayHeader();

        console.log(chalk.cyan.bold("\nWelcome to the DS Agents CLI!"));
        console.log(styles.separator);
        console.log(chalk.gray(`Type ${styles.exitCommand} to quit\n`));

        new Promise<void>((resolve) => {
          const processInput = async () => {
            while (!controller.signal.aborted) {
              try {
                const line = await rl.question(styles.prompt);
                if (line === styles.exitCommand) {
                  controller.abort();
                  break;
                }
                send(cliContext, { user: "user" }, { user: "user", text: line });
              } catch (error) {
                if (error instanceof Error) {
                  console.error(chalk.red("Error:"), error.message);
                }
              }
            }
            resolve();
          };
          processInput();
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
      handler(content, _ctx, _agent) {
        // If content is a string, convert it to the expected format
        const message = typeof content === "string" ? content : content.message;

        console.log(`${getTimestamp()} ${styles.agentLabel}: ${message}\n`);
        console.log(`${styles.separator}\n`);

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
        if (ref?.data) {
          message =
            typeof ref.data === "object" && ref.data.message ? ref.data.message : String(ref.data);
        }

        return formatMsg({
          role: "assistant",
          content: message,
        });
      },
    }),
  },

  // Add install function for one-time setup
  async install(_agent) {
    console.log(chalk.cyan("Installing CLI extension..."));

    // Register cleanup handler
    process.on("exit", () => {
      console.log(chalk.yellow("\nShutting down CLI extension..."));
      // Any cleanup needed when the process exits
    });

    // No return value needed (void)
  },
});
