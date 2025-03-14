import { describe, it, expect, vi, beforeEach } from "vitest";
import { execa } from "execa";
import {
  generateTemplateContent,
  createEnvVariables,
  createReadme,
} from "../../src/utils";

vi.mock("execa");

describe("Utility Functions", () => {
  describe("generateTemplateContent", () => {
    const templateContent = `/**
 * Template for testing
 */
import { createDreams } from "@daydreamsai/core";
import { {{MODEL_IMPORT_FUNCTION}} } from "{{MODEL_IMPORT_PATH}}";
import { cli } from "@daydreamsai/core/extensions";

const {{MODEL_VARIABLE}} = {{MODEL_IMPORT_FUNCTION}}({
  apiKey: process.env.{{ENV_VAR_KEY}},
});

const agent = createDreams({
  model: {{MODEL_VARIABLE}}.chat.completions.create({
    model: "{{MODEL_VERSION}}"
  }),
  extensions: [cli]
});

agent.run();`;

    it("should replace model-specific placeholders correctly", () => {
      const modelConfig = {
        MODEL_NAME: "OpenAI",
        MODEL_IMPORT_FUNCTION: "createOpenAI",
        MODEL_IMPORT_PATH: "@ai-sdk/openai",
        ENV_VAR_KEY: "OPENAI_API_KEY",
        MODEL_VARIABLE: "openai",
        MODEL_VERSION: "gpt-4o",
      };

      const result = generateTemplateContent(templateContent, modelConfig);

      expect(result).toContain('import { createOpenAI } from "@ai-sdk/openai"');
      expect(result).toContain("const openai = createOpenAI({");
      expect(result).toContain("apiKey: process.env.OPENAI_API_KEY");
      expect(result).toContain('model: "gpt-4o"');
      expect(result).toContain("* Daydreams agent with");
      expect(result).toContain("* Using OpenAI as the model provider");
    });

    it("should include specified extensions in the template", () => {
      const modelConfig = {
        MODEL_NAME: "Groq",
        MODEL_IMPORT_FUNCTION: "createGroq",
        MODEL_IMPORT_PATH: "@ai-sdk/groq",
        ENV_VAR_KEY: "GROQ_API_KEY",
        MODEL_VARIABLE: "groq",
        MODEL_VERSION: "deepseek-r1-distill-llama-70b",
      };

      const extensionImports = [
        'import { cli } from "@daydreamsai/core/extensions";',
        'import { twitter } from "@daydreamsai/core/extensions";',
        'import { discord } from "@daydreamsai/core/extensions";',
      ];

      const extensionsList = ["cli", "twitter", "discord"];

      const result = generateTemplateContent(
        templateContent,
        modelConfig,
        extensionImports,
        extensionsList
      );

      expect(result).toContain(
        'import { cli } from "@daydreamsai/core/extensions";'
      );
      expect(result).toContain(
        'import { twitter } from "@daydreamsai/core/extensions";'
      );
      expect(result).toContain(
        'import { discord } from "@daydreamsai/core/extensions";'
      );
      expect(result).toContain("extensions: [cli, twitter, discord]");
      expect(result).toContain(
        "* Daydreams agent with cli, twitter, discord extension(s)"
      );
    });
  });

  describe("createEnvVariables", () => {
    it("should include model-specific environment variables", () => {
      const result = createEnvVariables("openai", []);

      expect(result).toContain("OPENAI_API_KEY=your_openai_api_key");
      expect(result).not.toContain("GROQ_API_KEY=your_groq_api_key");
    });

    it("should include Twitter configuration when selected", () => {
      const result = createEnvVariables("groq", ["twitter"]);

      expect(result).toContain("# Twitter Configuration");
      expect(result).toContain("TWITTER_USERNAME=your_twitter_username");
      expect(result).toContain("TWITTER_CONSUMER_KEY=your_consumer_key");
    });

    it("should include Discord configuration when selected", () => {
      const result = createEnvVariables("anthropic", ["discord"]);

      expect(result).toContain("# Discord Configuration");
      expect(result).toContain("DISCORD_TOKEN=your_discord_token");
    });

    it("should include Telegram configuration when selected", () => {
      const result = createEnvVariables("google", ["telegram"]);

      expect(result).toContain("# Telegram Configuration");
      expect(result).toContain("TELEGRAM_TOKEN=your_telegram_token");
    });

    it("should include all selected extension configurations", () => {
      const result = createEnvVariables("groq", [
        "cli",
        "twitter",
        "discord",
        "telegram",
      ]);

      expect(result).toContain("# Twitter Configuration");
      expect(result).toContain("# Discord Configuration");
      expect(result).toContain("# Telegram Configuration");
    });
  });

  describe("createReadme", () => {
    it("should generate README with correct project name", () => {
      const result = createReadme("test-agent", ["cli"], "openai");

      expect(result).toContain("# test-agent");
    });

    it("should list all selected extensions", () => {
      const result = createReadme(
        "my-agent",
        ["cli", "twitter", "discord"],
        "anthropic"
      );

      expect(result).toContain("- cli");
      expect(result).toContain("- twitter");
      expect(result).toContain("- discord");
    });

    it("should include the selected model", () => {
      const result = createReadme("agent-x", ["cli"], "groq");

      expect(result).toContain("Uses groq as the model provider");
    });
  });
});
