import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import { mockProcessExit } from "vitest-mock-process";
import prompts from "prompts";

// Mock dependencies that need to be set up before dynamic imports
vi.mock("fs-extra");
vi.mock("execa");
vi.mock("prompts");

// Mock ora with a factory function approach
const createOraMock = () => {
  return {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
  };
};

// This approach ensures ora is properly mocked even after module resets
vi.mock("ora", () => {
  const oraMock = createOraMock();
  return {
    default: vi.fn().mockReturnValue(oraMock),
  };
});

// Helper to get the directory containing the test file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures");

// Create a global commander mock that all tests can access
const mockCommander = {
  name: vi.fn().mockReturnThis(),
  description: vi.fn().mockReturnThis(),
  version: vi.fn().mockReturnThis(),
  argument: vi.fn().mockReturnThis(),
  option: vi.fn().mockReturnThis(),
  parse: vi.fn().mockReturnThis(),
  action: vi.fn().mockReturnThis(),
  args: ["test-agent"],
  opts: vi.fn().mockReturnValue({
    cli: true,
    model: "groq",
  }),
};

// Mock commander module with our mock implementation
vi.mock("commander", () => {
  return {
    Command: vi.fn(() => mockCommander),
  };
});

describe("create-agent CLI", () => {
  let mockExit: ReturnType<typeof mockProcessExit>;
  let mainModule: any;

  beforeEach(async () => {
    mockExit = mockProcessExit();

    // Mock process.env
    const originalEnv = { ...process.env };
    vi.spyOn(process, "env", "get").mockReturnValue({
      ...originalEnv,
      NODE_ENV: "test",
    });

    // Clear all mocks
    vi.clearAllMocks();

    // Reset the commander mock for each test
    Object.entries(mockCommander).forEach(([key, value]) => {
      if (typeof value === "function" && vi.isMockFunction(value)) {
        value.mockClear().mockReturnThis();
      }
    });

    // Setup filesystem mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockImplementation(() => Promise.resolve([]));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.pathExists).mockImplementation(() => Promise.resolve(true)); // node_modules exists
    vi.mocked(fs.readFile).mockImplementation((filePath: any) => {
      if (typeof filePath === "string" && filePath.includes("template.ts")) {
        return Promise.resolve(`// Template file for testing
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

agent.run();`);
      }
      return Promise.resolve("");
    });

    // Mock prompts to return default values
    vi.mocked(prompts).mockResolvedValue({
      proceed: true,
      extensions: ["cli"],
    });

    // Mock execa for package manager detection
    vi.mocked(execa).mockResolvedValue({
      stdout: "Mocked stdout",
      stderr: "",
      failed: false,
      killed: false,
      timedOut: false,
      isCanceled: false,
      command: "",
      exitCode: 0,
      signalCode: null,
      spawnargs: [],
      escapedCommand: "",
      shortMessage: "",
      originalMessage: "",
      preferredHighWaterMark: undefined,
      signal: null,
      pipeFail: false,
      name: "",
      message: "",
      cause: undefined,
      code: undefined,
      stack: undefined,
    } as any);

    // Ensure ora mock is reset before we import the module
    vi.doMock("ora", () => {
      const oraMock = createOraMock();
      return {
        default: vi.fn().mockReturnValue(oraMock),
      };
    });

    // We need to use dynamic import to ensure all mocks are set up first
    vi.resetModules();
    mainModule = await import("../src/index.js");
  });

  afterEach(() => {
    mockExit.mockRestore();
    vi.restoreAllMocks();
  });

  it("should create a project with CLI extension and groq model", async () => {
    // Configure commander mock for this test
    mockCommander.opts.mockReturnValue({
      cli: true,
      model: "groq",
    });

    // Template content for testing
    const testTemplateContent = `// Template file for testing
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

    // Call the main function with test arguments and options
    await mainModule.main(
      ["test-agent"],
      {
        cli: true,
        model: "groq",
      },
      testTemplateContent
    );

    // Verify directory creation
    expect(fs.mkdir).toHaveBeenCalled();

    // Verify file creation - now expecting 4 files (package.json, tsconfig.json, index.ts, .env.example, README.md)
    expect(fs.writeFile).toHaveBeenCalledTimes(5);

    // Check that each expected file was created
    const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;

    // Find calls for specific files
    const packageJsonCall = writeFileCalls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith("package.json")
    );
    const tsconfigCall = writeFileCalls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith("tsconfig.json")
    );
    const indexCall = writeFileCalls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith("index.ts")
    );
    const envCall = writeFileCalls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith(".env.example")
    );
    const readmeCall = writeFileCalls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith("README.md")
    );

    // Verify each file was created
    expect(packageJsonCall).toBeDefined();
    expect(tsconfigCall).toBeDefined();
    expect(indexCall).toBeDefined();
    expect(envCall).toBeDefined();
    expect(readmeCall).toBeDefined();

    // Check content of files
    if (indexCall) {
      const indexContent = indexCall[1] as string;
      expect(indexContent).toContain("import { createGroq }");
      expect(indexContent).toContain("apiKey: process.env.GROQ_API_KEY");
      expect(indexContent).toContain("extensions: [cli]");
    }

    if (envCall) {
      const envContent = envCall[1] as string;
      expect(envContent).toContain("GROQ_API_KEY=your_groq_api_key");
    }

    if (readmeCall) {
      const readmeContent = readmeCall[1] as string;
      expect(readmeContent).toContain("- cli");
      expect(readmeContent).toContain("Uses groq as the model provider");
    }

    // Verify dependency installation
    expect(execa).toHaveBeenCalledWith("pnpm", ["install"], expect.anything());
  });

  it("should create a project with all extensions and specified model", async () => {
    // Reset commander mock for this specific test
    mockCommander.opts.mockReturnValue({
      all: true,
      model: "openai",
    });

    // Template content for testing
    const testTemplateContent = `// Template file for testing
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

    // Call the main function with test arguments and options
    await mainModule.main(
      ["test-agent"],
      {
        all: true,
        model: "openai",
      },
      testTemplateContent
    );

    // Verify that files were created with correct extensions
    const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;

    // Find calls for specific files
    const indexCall = writeFileCalls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith("index.ts")
    );

    // Check that index includes all extensions
    if (indexCall) {
      const indexContent = indexCall[1] as string;
      expect(indexContent).toContain("import { createOpenAI }");
      // Should have all extensions
      expect(indexContent).toContain("cli");
      expect(indexContent).toContain("twitter");
      expect(indexContent).toContain("discord");
      expect(indexContent).toContain("telegram");
    }
  });

  it("should handle case when directory exists and is not empty", async () => {
    // Mock directory exists and has files
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdir).mockImplementation(() =>
      Promise.resolve(["existing-file.txt"])
    );

    // Mock user declining to proceed
    vi.mocked(prompts).mockImplementation(() =>
      Promise.resolve({ proceed: false })
    );

    // Configure commander mock for this test
    mockCommander.opts.mockReturnValue({
      cli: true,
      model: "groq",
    });

    // Run main
    await mainModule.main(
      ["test-agent"],
      {
        cli: true,
        model: "groq",
      },
      "// Not needed for this test"
    );

    // Should not create files
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("should handle package installation error and try fallback", async () => {
    // Configure commander mock for this test
    mockCommander.opts.mockReturnValue({
      cli: true,
      model: "groq",
    });

    // Template content for testing
    const testTemplateContent = `// Template file for testing
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

    // Mock first install to fail
    vi.mocked(execa).mockRejectedValueOnce(new Error("Installation failed"));
    // But second install succeeds
    vi.mocked(execa).mockResolvedValueOnce({
      stdout: "Fallback install succeeded",
      stderr: "",
    } as any);

    // Run main
    await mainModule.main(
      ["test-agent"],
      {
        cli: true,
        model: "groq",
      },
      testTemplateContent
    );

    // Verify fallback was tried
    expect(execa).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(execa).mock.calls[0];
    const secondCall = vi.mocked(execa).mock.calls[1];

    expect(firstCall[0]).toBe("pnpm");
    expect(secondCall[0]).toBe("pnpm"); // Fallback is also pnpm
  });

  it("should prompt for extensions if none are specified", async () => {
    // Configure commander mock for this test - no extension flags
    mockCommander.opts.mockReturnValue({
      model: "anthropic",
      // No extension flags
    });

    // Template content for testing
    const testTemplateContent = `// Template file for testing
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

    // Mock prompts to return discord and telegram extensions
    vi.mocked(prompts).mockImplementation((options: any) => {
      if (options.name === "extensions") {
        return Promise.resolve({ extensions: ["discord", "telegram"] });
      }
      return Promise.resolve({ proceed: true });
    });

    // Run main with no extension flags
    await mainModule.main(
      ["test-agent"],
      {
        model: "anthropic",
        // No extension flags
      },
      testTemplateContent
    );

    // Verify that files were created with correct extensions
    const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;

    // Find index.ts content
    const indexCall = writeFileCalls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith("index.ts")
    );

    // Check that content includes selected extensions
    if (indexCall) {
      const indexContent = indexCall[1] as string;
      expect(indexContent).toContain("import { discord }");
      expect(indexContent).toContain("import { telegram }");
      expect(indexContent).toContain("extensions: [discord, telegram]");
      expect(indexContent).not.toContain("extensions: [cli]");
    }
  });
});
