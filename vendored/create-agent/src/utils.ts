import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

/**
 * Generates the content for an agent template by replacing placeholders
 * @param templateContent The original template content with placeholders
 * @param modelConfig The model-specific configuration values
 * @param extensionImports Array of extension import statements
 * @param extensionsList Array of extension variable names
 * @returns The processed template content
 */
export function generateTemplateContent(
  templateContent: string,
  modelConfig: Record<string, string>,
  extensionImports: string[] = [],
  extensionsList: string[] = []
): string {
  // Replace model-specific placeholders
  let processedContent = templateContent;

  // Replace placeholders with model-specific values
  Object.entries(modelConfig).forEach(([key, value]) => {
    const placeholder = new RegExp(`{{${key}}}`, "g");
    processedContent = processedContent.replace(placeholder, value);
  });

  // Replace extension imports if specified
  if (extensionImports.length > 0) {
    processedContent = processedContent.replace(
      `import { cli } from "@daydreamsai/core/extensions";`,
      extensionImports.join("\n")
    );
  }

  // Replace extensions list in createDreams if specified
  if (extensionsList.length > 0) {
    processedContent = processedContent.replace(
      "extensions: [cli]",
      `extensions: [${extensionsList.join(", ")}]`
    );
  }

  // Add header comment
  const headerComment = `/**
 * Daydreams agent with ${extensionsList.join(", ")} extension(s)
 * Using ${modelConfig.MODEL_NAME} as the model provider
 */`;

  processedContent = processedContent.replace(
    /\/\*\*[\s\S]*?\*\//,
    headerComment
  );

  return processedContent;
}

/**
 * Creates environment variables content for the .env.example file
 * @param selectedModel The selected model provider
 * @param selectedExtensions Array of selected extensions
 * @returns The content for the .env.example file
 */
export function createEnvVariables(
  selectedModel: string,
  selectedExtensions: string[]
): string {
  const envVariables = ["# Daydreams Environment Variables\n"];

  // Model configurations
  envVariables.push("# Model Configurations");
  if (selectedModel === "groq") {
    envVariables.push("GROQ_API_KEY=your_groq_api_key");
  } else if (selectedModel === "openai") {
    envVariables.push("OPENAI_API_KEY=your_openai_api_key");
  } else if (selectedModel === "anthropic") {
    envVariables.push("ANTHROPIC_API_KEY=your_anthropic_api_key");
  } else if (selectedModel === "google") {
    envVariables.push("GOOGLE_API_KEY=your_google_api_key");
  }

  // Add OpenRouter API key regardless of selected model
  envVariables.push("OPENROUTER_API_KEY=your_openrouter_api_key\n");

  // Twitter Configuration
  if (selectedExtensions.includes("twitter")) {
    envVariables.push("# Twitter Configuration");
    // Add both authentication methods
    envVariables.push("# Method 1: Username/Password");
    envVariables.push("TWITTER_USERNAME=your_twitter_username");
    envVariables.push("TWITTER_PASSWORD=your_twitter_password");
    envVariables.push("TWITTER_EMAIL=your_twitter_email");

    envVariables.push("# Method 2: API Keys");
    envVariables.push("TWITTER_CONSUMER_KEY=your_consumer_key");
    envVariables.push("TWITTER_CONSUMER_SECRET=your_consumer_secret");
    envVariables.push("TWITTER_ACCESS_TOKEN=your_access_token");
    envVariables.push("TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret\n");
  }

  // Discord Configuration
  if (selectedExtensions.includes("discord")) {
    envVariables.push("# Discord Configuration");
    envVariables.push(
      "# Discord Bot Token (https://discord.com/developers/applications)"
    );
    envVariables.push(
      "# Required Gateway Intents: Server Members, Message Content, Presence"
    );
    envVariables.push("DISCORD_TOKEN=your_discord_token");
    envVariables.push("DISCORD_BOT_NAME=your_bot_name\n");
  }

  // Telegram Configuration
  if (selectedExtensions.includes("telegram")) {
    envVariables.push("# Telegram Configuration");
    envVariables.push(
      "# TELEGRAM_STARTUP_CHAT_ID: Chat ID where startup notifications will be sent"
    );
    envVariables.push("TELEGRAM_STARTUP_CHAT_ID=your_startup_chat_id");

    envVariables.push(
      "# GramJS Configuration (required for both bot and user clients)"
    );
    envVariables.push(
      "# TELEGRAM_TOKEN: Bot token from @BotFather (required for bot mode)"
    );
    envVariables.push("TELEGRAM_TOKEN=your_telegram_token");

    envVariables.push("# Get these from https://my.telegram.org/apps");
    envVariables.push("TELEGRAM_API_ID=your_api_id");
    envVariables.push("TELEGRAM_API_HASH=your_api_hash");

    envVariables.push("# Optional: Session string for user authentication");
    envVariables.push(
      "# After first successful interactive login, the app will provide a session string"
    );
    envVariables.push(
      "# Save it here to avoid interactive login in subsequent runs"
    );
    envVariables.push("TELEGRAM_USER_SESSION=your_session_string\n");
  }

  // Add common configurations regardless of extensions
  envVariables.push("# General Configuration");
  envVariables.push("DRY_RUN=1");
  envVariables.push(
    "GRAPHQL_URL=https://api.cartridge.gg/x/sepolia-rc-18/torii\n"
  );

  // Add blockchain configurations
  envVariables.push("# Blockchain Configurations");

  envVariables.push("# Starknet Configuration");
  envVariables.push("STARKNET_RPC_URL=your_starknet_rpc_url");
  envVariables.push("STARKNET_ADDRESS=your_starknet_address");
  envVariables.push("STARKNET_PRIVATE_KEY=your_starknet_private_key\n");

  envVariables.push("# Hyperliquid Trading Configuration");
  envVariables.push(
    "# HYPERLIQUID_MAIN_ADDRESS: Your main Hyperliquid address (format: 0x...)"
  );
  envVariables.push(
    "# HYPERLIQUID_WALLET_ADDRESS: Your wallet address for trading (format: 0x...)"
  );
  envVariables.push(
    "# HYPERLIQUID_PRIVATE_KEY: Your private key (Keep this secure!)"
  );
  envVariables.push("HYPERLIQUID_MAIN_ADDRESS=your_main_address");
  envVariables.push("HYPERLIQUID_WALLET_ADDRESS=your_wallet_address");
  envVariables.push("HYPERLIQUID_PRIVATE_KEY=your_private_key\n");

  envVariables.push("# Sui Configuration");
  envVariables.push(
    "# Sui Mnemonic Seed Phrase (`sui keytool generate ed25519`), Also support `suiprivatekeyxxxx` (sui keytool export --key-identity 0x63)"
  );
  envVariables.push("SUI_PRIVATE_KEY=your_sui_private_key");
  envVariables.push(
    "SUI_NETWORK=mainnet   # must be one of mainnet, testnet, devnet, localnet\n"
  );

  return envVariables.join("\n");
}

/**
 * Creates a README file content for the agent
 * @param projectName The name of the project
 * @param selectedExtensions Array of selected extensions
 * @param selectedModel The selected model provider
 * @returns The content for the README.md file
 */
export function createReadme(
  projectName: string,
  selectedExtensions: string[],
  selectedModel: string
): string {
  return `# ${projectName}

A Daydreams agent with the following extensions:
${selectedExtensions.map((ext) => `- ${ext}`).join("\n")}

## Features

- Uses ${selectedModel} as the model provider
- Includes context for managing goals and tasks
- Provides actions for adding and completing tasks

## Getting Started

1. Copy \`.env.example\` to \`.env\` and fill in the required values.
2. Install dependencies:

\`\`\`
bun install
\`\`\`

3. Run the agent:

\`\`\`
bun start
\`\`\`

## Customizing Your Agent

You can modify the \`index.ts\` file to add more contexts, actions, or change the model configuration.
`;
}
