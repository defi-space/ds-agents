import {
  LogLevel,
  type Action,
  type ActionCall,
  type ActionResult,
  type Agent,
  type AnyAction,
  type AnyAgent,
  type AnyContext,
  type Config,
  type Context,
  type ContextState,
  type Debugger,
  type Handlers,
  type Log,
  type Output,
  type OutputRef,
  type Subscription,
  type Thought,
  type WorkingMemory,
} from "./types";
import { Logger } from "./logger";
import createContainer from "./container";
import { createServiceManager } from "./serviceProvider";
import { z } from "zod";
import { TaskRunner } from "./task";
import { handleStream, type StackElement } from "./prompts/main";
import { defaultWorkingMemory } from "./context";
import { createMemoryStore } from "./memory";
import { createPrompt } from "./prompt";
import { createMemory } from "./memory";
import { createVectorStore } from "./memory/base";
import { v7 as randomUUIDv7 } from "uuid";
import { runAction, runGenerate, runGenerateResults } from "./tasks";
import {
  createEpisodeFromWorkingMemory,
  exportEpisodesAsTrainingData,
} from "./memory/utils";
import type { Episode } from "./types";

export function createDreams<
  Memory = any,
  TContext extends Context<Memory, any, any, any> = Context<
    Memory,
    any,
    any,
    any
  >,
>(config: Config<Memory, TContext>): Agent<Memory, TContext> {
  let booted = false;

  const inputSubscriptions = new Map<string, Subscription>();
  const contexts = new Map<string, { type: string; args?: any }>();
  const contextsRunning = new Set<string>();

  const {
    inputs = {},
    outputs = {},
    events = {},
    actions = [],
    experts = {},
    services = [],
    extensions = [],
    model,
    reasoningModel,
    exportTrainingData,
    trainingDataPath,
  } = config;

  const container = config.container ?? createContainer();

  const taskRunner = config.taskRunner ?? new TaskRunner(3);

  const logger = new Logger({
    level: config.logger ?? LogLevel.INFO,
    enableTimestamp: true,
    enableColors: true,
  });

  container.instance("logger", logger);

  logger.debug("dreams", "Creating agent", {
    hasModel: !!model,
    hasReasoningModel: !!reasoningModel,
    inputsCount: Object.keys(inputs).length,
    outputsCount: Object.keys(outputs).length,
    actionsCount: actions.length,
    servicesCount: services.length,
    extensionsCount: extensions.length,
  });

  const debug: Debugger = (...args) => {
    if (!config.debugger) return;
    try {
      config.debugger(...args);
    } catch {
      console.log("debugger failed");
    }
  };

  const serviceManager = createServiceManager(container);

  for (const service of services) {
    serviceManager.register(service);
  }

  for (const extension of extensions) {
    if (extension.inputs) Object.assign(inputs, extension.inputs);
    if (extension.outputs) Object.assign(outputs, extension.outputs);
    if (extension.events) Object.assign(events, extension.events);
    if (extension.actions) actions.push(...extension.actions);
    if (extension.services) {
      for (const service of extension.services) {
        serviceManager.register(service);
      }
    }
  }

  const agent: Agent<Memory, TContext> = {
    inputs,
    outputs,
    events,
    actions,
    experts,
    memory:
      config.memory ?? createMemory(createMemoryStore(), createVectorStore()),
    container,
    model,
    reasoningModel,
    taskRunner,
    debugger: debug,
    context: config.context ?? undefined,
    exportTrainingData,
    trainingDataPath,
    emit: (event: string, data: any) => {
      logger.debug("agent:event", event, data);
    },

    async getContexts() {
      return Array.from(contexts.entries()).map(([id, { type, args }]) => ({
        id,
        type,
        args,
      }));
    },

    getContext(params) {
      logger.trace("agent:getContext", "Getting context state", params);
      return getContextState(agent, params.context, params.args);
    },

    getContextId(params) {
      logger.trace("agent:getContextId", "Getting context id", params);
      return getContextId(params.context, params.args);
    },

    getWorkingMemory(contextId) {
      logger.trace("agent:getWorkingMemory", "Getting working memory", {
        contextId,
      });
      return getContextWorkingMemory(agent, contextId);
    },

    async start(args) {
      logger.info("agent:start", "Starting agent", { args, booted });
      if (booted) return agent;

      booted = true;

      logger.debug("agent:start", "Booting services");
      await serviceManager.bootAll();

      logger.debug("agent:start", "Installing extensions", {
        count: extensions.length,
      });
      for (const extension of extensions) {
        if (extension.install) await extension.install(agent);
      }

      logger.debug("agent:start", "Setting up inputs", {
        count: Object.keys(agent.inputs).length,
      });

      for (const [type, input] of Object.entries(agent.inputs)) {
        if (input.install) {
          logger.trace("agent:start", "Installing input", { type });
          await Promise.resolve(input.install(agent));
        }

        if (input.subscribe) {
          logger.trace("agent:start", "Subscribing to input", { type });
          let subscription = input.subscribe((context, args, data) => {
            logger.debug("agent", "input", { context, args, data });
            agent
              .send({
                context,
                input: { type, data },
                args,
              })
              .catch((err) => {
                logger.error("agent:input", "error", err);
              });
          }, agent);

          if (typeof subscription === "object") {
            subscription = await Promise.resolve(subscription);
          }

          if (subscription) inputSubscriptions.set(type, subscription);
        }
      }

      logger.debug("agent:start", "Setting up outputs", {
        count: Object.keys(outputs).length,
      });
      for (const [type, output] of Object.entries(outputs)) {
        if (output.install) {
          logger.trace("agent:start", "Installing output", { type });
          await Promise.resolve(output.install(agent));
        }
      }

      logger.debug("agent:start", "Setting up actions", {
        count: actions.length,
      });
      for (const action of actions) {
        if (action.install) {
          logger.trace("agent:start", "Installing action", {
            name: action.name,
          });
          await Promise.resolve(action.install(agent));
        }
      }

      if (agent.context) {
        logger.debug("agent:start", "Setting up agent context", {
          type: agent.context.type,
        });
        const { id } = await getContextState(agent, agent.context, args);
        contexts.set(id, { type: agent.context.type, args });
        contexts.set("agent:context", { type: agent.context.type, args });
      }

      logger.debug("agent:start", "Loading saved contexts");
      const savedContexts =
        await agent.memory.store.get<[string, { type: string; args?: any }][]>(
          "contexts"
        );

      if (savedContexts) {
        logger.trace("agent:start", "Restoring saved contexts", {
          count: savedContexts.length,
        });
        for (const [id, { type, args }] of savedContexts) {
          contexts.set(id, { type, args });
        }
      }

      logger.info("agent:start", "Agent started successfully");
      return agent;
    },

    async stop() {
      logger.info("agent:stop", "Stopping agent");
    },

    run: async ({ context, args, outputs, handlers }) => {
      if (!booted) {
        logger.error("agent:run", "Agent not booted");
        throw new Error("Not booted");
      }

      logger.info("agent:run", "Running context", {
        contextType: context.type,
        hasArgs: !!args,
        hasCustomOutputs: !!outputs,
        hasHandlers: !!handlers,
      });

      const ctxState = await getContextState(agent, context, args);
      logger.debug("agent:run", "Context state retrieved", { id: ctxState.id });

      contexts.set(ctxState.id, { type: context.type, args });

      await agent.memory.store.set<[string, { args?: any }][]>(
        "contexts",
        Array.from(contexts.entries())
      );

      if (contextsRunning.has(ctxState.id)) {
        logger.debug("agent:run", "Context already running", {
          id: ctxState.id,
        });
        return [];
      }

      contextsRunning.add(ctxState.id);
      logger.debug("agent:run", "Added context to running set", {
        id: ctxState.id,
      });

      const workingMemory = await getContextWorkingMemory(agent, ctxState.id);
      logger.trace("agent:run", "Working memory retrieved", {
        id: ctxState.id,
        inputsCount: workingMemory.inputs.length,
        outputsCount: workingMemory.outputs.length,
        thoughtsCount: workingMemory.thoughts.length,
      });

      const contextOuputs: Output[] = Object.entries({
        ...agent.outputs,
        ...(outputs ?? {}),
      })
        .filter(([_, output]) =>
          output.enabled
            ? output.enabled({
                ...ctxState,
                context,
                workingMemory,
              })
            : true
        )
        .map(([type, output]) => ({
          type,
          ...output,
        }));

      logger.debug("agent:run", "Enabled outputs", {
        count: contextOuputs.length,
      });

      logger.debug("agent:run", "Preparing actions");
      const contextActions = await Promise.all(
        actions.map(async (action) => {
          let actionMemory: unknown = {};

          if (action.memory) {
            actionMemory =
              (await agent.memory.store.get(action.memory.key)) ??
              action.memory.create();
          }

          const enabled = action.enabled
            ? action.enabled({
                ...ctxState,
                context,
                workingMemory,
                actionMemory,
              })
            : true;

          return enabled ? action : undefined;
        })
      ).then((r) => r.filter((a) => !!a));

      logger.debug("agent:run", "Enabled actions", {
        count: contextActions.length,
      });

      const agentCtxState = agent.context
        ? await getContextState(
            agent,
            agent.context,
            contexts.get("agent:context")!.args
          )
        : undefined;

      logger.debug("agent:run", "Agent context state", {
        hasAgentContext: !!agentCtxState,
        id: agentCtxState?.id,
      });

      const chain: Log[] = [];

      let hasError = false;

      let actionCalls: Promise<any>[] = [];

      const { state, handler } = createContextStreamHandler({
        agent,
        chain,
        actions: contextActions,
        actionCalls,
        agentCtxState,
        ctxState,
        handlers,
        logger,
        outputs: contextOuputs,
        taskRunner,
        workingMemory,
      });

      let step = 1;
      const maxSteps = 3;

      while (maxSteps > step) {
        logger.info("agent:run", `Starting step ${step}/${maxSteps}`, {
          contextId: ctxState.id,
        });

        try {
          const { stream, response } = await taskRunner.enqueueTask(
            step > 1 ? runGenerateResults : runGenerate,
            {
              agent,
              model: config.reasoningModel ?? config.model,
              contexts: [agentCtxState, ctxState].filter((t) => !!t),
              contextId: ctxState.id,
              actions: contextActions,
              outputs: contextOuputs,
              workingMemory,
              logger,
              chain,
            },
            {
              debug: agent.debugger,
            }
          );

          logger.debug("agent:run", "Processing stream", { step });
          await handleStream(stream, state.index, handler);

          logger.debug("agent:run", "Waiting for action calls to complete", {
            pendingCalls: actionCalls.length,
          });

          await Promise.allSettled(actionCalls);

          actionCalls.length = 0;

          // Trim working memory after processing each step
          trimWorkingMemory(workingMemory);

          logger.debug("agent:run", "Saving context state", {
            id: ctxState.id,
          });

          await agent.memory.store.set(ctxState.id, ctxState.memory);

          if (agentCtxState) {
            logger.debug("agent:run", "Saving agent context state", {
              id: agentCtxState.id,
            });

            await agent.memory.store.set(
              agentCtxState.id,
              agentCtxState.memory
            );
          }

          logger.debug("agent:run", "Saving working memory", {
            id: ctxState.id,
            workingMemory,
          });

          step++;

          if (hasError) {
            logger.warn("agent:run", "Continuing despite error", { step });
            continue;
          }

          const pendingResults = workingMemory.results.filter(
            (i) => i.processed === false
          );

          await saveContextWorkingMemory(agent, ctxState.id, workingMemory);

          if (pendingResults.length === 0) break;
        } catch (error) {
          console.log({ error });
          break;
        }
      }

      logger.debug("agent:run", "Marking all inputs as processed");

      workingMemory.inputs.forEach((i) => {
        i.processed = true;
      });

      logger.debug("agent:run", "Removing context from running set", {
        id: ctxState.id,
      });

      contextsRunning.delete(ctxState.id);

      logger.info("agent:run", "Run completed", {
        contextId: ctxState.id,
        chainLength: chain.length,
      });

      return chain;
    },

    send: async (params) => {
      logger.info("agent:send", "Sending input", {
        inputType: params.input.type,
        contextType: params.context.type,
      });

      if (params.input.type in agent.inputs === false) {
        logger.error("agent:send", "Invalid input type", {
          type: params.input.type,
        });
        throw new Error("invalid input");
      }

      const {
        key,
        id: contextId,
        options,
        memory,
      } = await getContextState(
        agent,
        params.context,
        params.context.schema.parse(params.args)
      );

      logger.debug("agent:send", "Context state retrieved", {
        id: contextId,
        key,
      });

      const workingMemory = await getContextWorkingMemory(agent, contextId);
      logger.trace("agent:send", "Working memory retrieved", {
        id: contextId,
        inputsCount: workingMemory.inputs.length,
      });

      const input = agent.inputs[params.input.type];
      const data = input.schema.parse(params.input.data);
      logger.debug("agent:send", "Input data parsed", {
        type: params.input.type,
      });

      logger.debug("agent:send", "Querying episodic memory");

      const episodicMemory = await agent.memory.vector.query(
        `${contextId}`,
        JSON.stringify(data, (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString() + 'n';
          }
          return value;
        })
      );

      logger.trace("agent:send", "Episodic memory retrieved", {
        episodesCount: episodicMemory.length,
      });

      workingMemory.episodicMemory = {
        episodes: episodicMemory,
      };

      if (input.handler) {
        logger.debug("agent:send", "Using custom input handler", {
          type: params.input.type,
        });
        await input.handler(
          data,
          {
            type: params.context.type,
            key,
            memory,
            workingMemory,
            options,
          } as any,
          agent
        );
      } else {
        logger.debug("agent:send", "Adding input to working memory", {
          type: params.context.type,
        });
        workingMemory.inputs.push({
          id: randomUUIDv7(),
          ref: "input",
          type: params.context.type,
          data,
          timestamp: Date.now(),
          formatted: input.format ? input.format(data) : undefined,
        });
      }

      logger.debug("agent:send", "Running evaluator");
      await agent.evaluator({
        type: params.context.type,
        key,
        memory,
        options,
      } as any);

      logger.debug("agent:send", "Saving context memory", { id: contextId });
      await agent.memory.store.set(contextId, memory);

      logger.debug("agent:send", "Saving working memory");
      await saveContextWorkingMemory(agent, contextId, workingMemory);

      logger.debug("agent:send", "Running run method");
      return await agent.run(params);
    },

    evaluator: async (ctx) => {
      const { id, memory } = ctx;
      logger.debug("agent:evaluator", "memory", memory);
    },

    /**
     * Exports all episodes as training data
     * @param filePath Optional path to save the training data
     */
    async exportAllTrainingData(filePath?: string) {
      logger.info(
        "agent:exportTrainingData",
        "Exporting episodes as training data"
      );

      // Get all contexts
      const contexts = await agent.getContexts();

      // Collect all episodes from all contexts
      const allEpisodes: Episode[] = [];

      for (const { id } of contexts) {
        const episodes = await agent.memory.vector.query(id, "");
        if (episodes.length > 0) {
          allEpisodes.push(...episodes);
        }
      }

      logger.info(
        "agent:exportTrainingData",
        `Found ${allEpisodes.length} episodes to export`
      );

      // Export episodes as training data
      if (allEpisodes.length > 0) {
        await exportEpisodesAsTrainingData(
          allEpisodes,
          filePath || agent.trainingDataPath || "./training-data.jsonl"
        );
        logger.info(
          "agent:exportTrainingData",
          "Episodes exported successfully"
        );
      } else {
        logger.warn("agent:exportTrainingData", "No episodes found to export");
      }
    },
  };

  container.instance("agent", agent);

  return agent;
}

function getContextId<TContext extends AnyContext>(
  context: TContext,
  args: z.infer<TContext["schema"]>
) {
  const key = context.key ? context.key(args) : context.type;
  return context.key ? [context.type, key].join(":") : context.type;
}

async function getContextState<TContext extends AnyContext>(
  agent: AnyAgent,
  context: TContext,
  args: z.infer<TContext["schema"]>
): Promise<ContextState<TContext>> {
  const key = context.key ? context.key(args) : context.type;
  const id = context.key ? [context.type, key].join(":") : context.type;

  const options = context.setup ? await context.setup(args, agent) : {};

  const memory =
    (await agent.memory.store.get(id)) ??
    (context.create
      ? context.create({ key, args, context, id: id, options })
      : {});

  return {
    id,
    key,
    args,
    options,
    context,
    memory,
  };
}

async function getContextWorkingMemory(agent: AnyAgent, contextId: string) {
  return (
    (await agent.memory.store.get<WorkingMemory>(
      [contextId, "working-memory"].join(":")
    )) ?? (await defaultWorkingMemory.create())
  );
}

async function saveContextWorkingMemory(
  agent: AnyAgent,
  contextId: string,
  workingMemory: WorkingMemory
) {
  return await agent.memory.store.set(
    [contextId, "working-memory"].join(":"),
    workingMemory
  );
}

class ActionNotFoundError extends Error {
  constructor(public call: ActionCall) {
    super();
  }
}

class ParsingError extends Error {
  constructor(public parsingError: unknown) {
    super();
  }
}

async function prepareActionCall({
  call,
  actions,
  logger,
}: {
  call: ActionCall;
  actions: AnyAction[];
  logger: Logger;
}) {
  const action = actions.find((a) => a.name === call.name);

  if (!action) {
    logger.error("agent:action", "ACTION_MISMATCH", {
      name: call.name,
      data: call.content,
    });

    throw new ActionNotFoundError(call);
  }

  try {
    const data = action.schema.parse(JSON.parse(call.content));
    call.data = data;
    return { action, data };
  } catch (error) {
    throw new ParsingError(error);
  }
}

async function handleActionCall({
  state,
  workingMemory,
  action,
  logger,
  call,
  taskRunner,
  agent,
  agentState,
}: {
  state: ContextState<AnyContext>;
  workingMemory: WorkingMemory;
  call: ActionCall;
  action: AnyAction;
  logger: Logger;
  taskRunner: TaskRunner;
  agent: AnyAgent;
  agentState?: ContextState;
}) {
  let actionMemory: unknown = {};

  if (action.memory) {
    actionMemory =
      (await agent.memory.store.get(action.memory.key)) ??
      action.memory.create();
  }

  const resultData = await taskRunner.enqueueTask(
    runAction,
    {
      action,
      call,
      agent,
      logger,
      ctx: {
        ...state,
        workingMemory,
        actionMemory,
        agentMemory: agentState?.memory,
      },
    },
    {
      debug: agent.debugger,
    }
  );

  const result: ActionResult = {
    ref: "action_result",
    id: randomUUIDv7(),
    callId: call.id,
    data: resultData,
    name: call.name,
    timestamp: Date.now(),
    processed: false,
  };

  if (action.format) result.formatted = action.format(result);

  if (action.memory) {
    await agent.memory.store.set(action.memory.key, actionMemory);
  }

  return result;
}

async function handleOutput({
  outputRef,
  outputs,
  logger,
  state,
  workingMemory,
  agent,
}: {
  outputs: Output[];
  outputRef: OutputRef;
  logger: Logger;
  workingMemory: WorkingMemory;
  state: ContextState;
  agent: AnyAgent;
}) {
  const output = outputs.find((output) => output.type === outputRef.type);

  if (!output) {
    logger.error("agent:output", "OUTPUT_NOT_FOUND", {
      outputRef,
      availableOutputs: outputs.map((o) => o.type),
    });
    return {
      ...outputRef,
      params: { error: "OUTPUT NOT FOUND" },
      timestamp: Date.now(),
      data: { content: outputRef.data, error: "OUTPUT NOT FOUND" },
    };
  }

  logger.debug("agent:output", outputRef.type, outputRef.data);

  try {
    let parsedContent = outputRef.data;
    if (typeof parsedContent === "string") {
      if (output.schema._def.typeName !== "ZodString") {
        try {
          // Check if the string looks like JSON before trying to parse it
          const trimmed = parsedContent.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
              (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            parsedContent = JSON.parse(trimmed);
          } else {
            // If it doesn't look like JSON, log it and keep it as string but wrapped in an object
            logger.debug("agent:output", "Content doesn't appear to be JSON, wrapping in content object", {
              content: trimmed.substring(0, 100) + (trimmed.length > 100 ? '...' : '')
            });
            // Wrap the string in a content object to satisfy schemas expecting objects
            parsedContent = { content: trimmed };
          }
        } catch (error) {
          logger.debug("agent:output", "Failed parsing output content, wrapping in content object", {
            content: typeof parsedContent === 'string' ? 
              parsedContent.substring(0, 100) + (parsedContent.length > 100 ? '...' : '') : 
              parsedContent,
            error: error instanceof Error ? error.message : String(error)
          });
          // Wrap the string in a content object to satisfy schemas expecting objects
          parsedContent = { content: typeof parsedContent === 'string' ? parsedContent : String(parsedContent) };
        }
      }
    }
    let data: any;
    try {
      data = output.schema.parse(parsedContent);
    } catch (error) {
      logger.error("agent:output", "Schema validation error", {
        type: outputRef.type,
        content: typeof parsedContent === 'string' ? 
          parsedContent.substring(0, 100) + (parsedContent.length > 100 ? '...' : '') : 
          JSON.stringify(parsedContent).substring(0, 100) + (JSON.stringify(parsedContent).length > 100 ? '...' : ''),
        error: error instanceof Error ? error.message : String(error)
      });
      
      // If schema validation fails, create a fallback object with the original content
      // This prevents the error from propagating and allows the agent to continue
      return {
        ...outputRef,
        params: { error: "SCHEMA_VALIDATION_ERROR" },
        timestamp: Date.now(),
        data: { content: outputRef.data, error: error instanceof Error ? error.message : String(error) },
        processed: true // Mark as processed to avoid retrying
      };
    }

    const response = await output.handler(
      data,
      {
        ...state,
        workingMemory,
      },
      agent
    );

    if (Array.isArray(response)) {
      const refs: OutputRef[] = [];
      for (const res of response) {
        const ref: OutputRef = {
          ...outputRef,
          id: randomUUIDv7(),
          ...res,
        };

        ref.formatted = output.format ? output.format(response) : undefined;
        refs.push(ref);
      }
      return refs;
    } else if (response) {
      const ref: OutputRef = {
        ...outputRef,
        ...response,
      };

      ref.formatted = output.format ? output.format(response) : undefined;

      return ref;
    }

    return {
      ...outputRef,
      formatted: output.format ? output.format(data) : undefined,
      data,
    };
  } catch (error) {
    const ref: OutputRef = {
      ...outputRef,
      params: { error: "true" },
      timestamp: Date.now(),
      data: { content: outputRef.data, error },
    };

    logger.error("agent:output", outputRef.type, error);

    return ref;
  }
}

type PartialLog = Partial<Log> & Pick<Log, "ref" | "id" | "timestamp">;

async function generateEpisode(
  thought: Thought,
  actionCall: ActionCall,
  result: ActionResult,
  agent: AnyAgent,
  contextId: string,
  actions: AnyAction[]
) {
  // Find the corresponding Action for the ActionCall
  const action = actions.find((a) => a.name === actionCall.name);

  if (!action) {
    return;
  }

  const thoughts = [thought];
  const actionsArray = [action];
  const results = [result];

  const episode = await createEpisodeFromWorkingMemory(
    thoughts,
    actionsArray,
    results,
    agent,
    {
      exportTrainingData: agent.exportTrainingData === true,
      trainingDataPath: agent.trainingDataPath || "./training-data.jsonl",
    }
  );

  await agent.memory.vector.upsert(`${contextId}`, [
    {
      id: episode.id,
      text: episode.observation,
      metadata: episode,
    },
  ]);
}

function createContextStreamHandler({
  agent,
  chain,
  ctxState,
  agentCtxState,
  logger,
  handlers,
  taskRunner,
  outputs,
  actions,
  actionCalls,
  workingMemory,
}: {
  agent: AnyAgent;
  taskRunner: TaskRunner;
  ctxState: ContextState<AnyContext>;
  agentCtxState?: ContextState<AnyContext>;
  chain: Log[];
  logger: Logger;
  handlers?: Partial<Handlers>;
  outputs: Output[];
  actions: AnyAction[];
  actionCalls: Promise<any>[];
  workingMemory: WorkingMemory;
}) {
  const state = {
    index: 0,
    logsByIndex: new Map<number, PartialLog>(),
  };

  function getOrCreateRef<TLog extends Omit<PartialLog, "id" | "timestamp">>(
    index: number,
    ref: TLog
  ): TLog & Pick<PartialLog, "id" | "timestamp"> {
    if (!state.logsByIndex.has(index)) {
      state.logsByIndex.set(index, {
        id: randomUUIDv7(),
        timestamp: Date.now(),
        ...ref,
      });
    }

    return state.logsByIndex.get(index)! as TLog &
      Pick<PartialLog, "id" | "timestamp">;
  }

  async function pushLogStream(log: Log, done: boolean) {
    if (done) chain.push(log);

    if (log.ref === "thought" && done) {
      workingMemory.thoughts.push(log);
      logger.debug("agent:think", "thought", log.content);
      handlers?.onThinking?.(log);
    }

    if (log.ref === "action_call" && done) {
      workingMemory.calls.push(log);
    }

    if (log.ref === "action_result" && done) {
      workingMemory.results.push(log);

      // Find the most recent thought and action call
      const lastThought =
        workingMemory.thoughts[workingMemory.thoughts.length - 1];
      const lastActionCall =
        workingMemory.calls[workingMemory.calls.length - 1];

      // If we have a complete thought-action-result cycle, generate an episode
      if (lastThought && lastActionCall) {
        // Generate episode with the last thought, action call, and result
        generateEpisode(
          lastThought,
          lastActionCall,
          log,
          agent,
          ctxState.id,
          actions
        ).catch((error) => {
          logger.error(
            "agent:generateEpisode",
            "Failed to generate episode",
            error
          );
        });
      }
    }

    handlers?.onLogStream?.(log, done);
  }

  async function handleActionCallStream(call: ActionCall, done: boolean) {
    if (!done) {
      return pushLogStream(call, false);
    }

    // todo: handle errors
    const { action } = await prepareActionCall({
      call,
      actions,
      logger,
    });

    pushLogStream(call, true);

    actionCalls.push(
      handleActionCall({
        call,
        action,
        agent,
        logger,
        state: ctxState,
        taskRunner,
        workingMemory,
        agentState: agentCtxState,
      }).then((res) => {
        pushLogStream(res, true);
        return res;
      })
    );
  }

  async function handleOutputStream(outputRef: OutputRef, done: boolean) {
    if (!done) {
      return pushLogStream(outputRef, false);
    }

    const refs = await handleOutput({
      agent,
      logger,
      state: ctxState,
      workingMemory,
      outputs,
      outputRef,
    });

    for (const ref of Array.isArray(refs) ? refs : [refs]) {
      // Only mark simple outputs as processed immediately
      // Complex outputs that might need further reasoning should remain unprocessed
      const output = outputs.find((output) => output.type === ref.type);
      const isSimpleOutput =
        output?.schema?._def?.typeName === "ZodString" ||
        (output?.schema?._def?.typeName === "ZodObject" &&
          Object.keys(output?.schema?._def?.shape() || {}).length <= 2);

      // Mark as processed only if it's a simple output or has an error
      ref.processed = isSimpleOutput || ref.params?.error ? true : false;

      logger.debug("agent:output", "Output processed status", {
        type: ref.type,
        processed: ref.processed,
        isSimpleOutput,
      });

      chain.push(ref);
      workingMemory.outputs.push(ref);
      pushLogStream(ref, true);
    }
  }

  async function handler(el: StackElement) {
    state.index = el.index > state.index ? el.index : state.index;
    // console.log({ index: el.index, lastIndex: state.index });

    switch (el.tag) {
      case "think":
      case "reasoning": {
        const ref = getOrCreateRef(el.index, {
          ref: "thought",
        });

        pushLogStream(
          {
            ...ref,
            content: el.content.join(""),
          },
          el.done
        );

        break;
      }

      case "action_call": {
        const ref = getOrCreateRef(el.index, {
          ref: "action_call",
        });

        handleActionCallStream(
          {
            ...ref,
            name: el.attributes.name,
            content: el.content.join(""),
            data: undefined,
          },
          el.done
        );

        break;
      }
      case "output": {
        const ref = getOrCreateRef(el.index, {
          ref: "output",
        });

        // Check if the type attribute exists
        if (!el.attributes.type) {
          logger.error("agent:output", "Missing output type attribute", {
            content: el.content.join(""),
            attributes: el.attributes,
          });
          break;
        }

        handleOutputStream(
          {
            ...ref,
            type: el.attributes.type,
            data: el.content.join("").trim(),
          },
          el.done
        );
        break;
      }

      case "finalize": {
        if (el.done) {
          logger.debug("agent:finalize", "Model requested to finalize flow");
          workingMemory.isFinal = true;
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    state,
    handler,
  };
}

function trimWorkingMemory(workingMemory: WorkingMemory) {
  // Reduce the maximum number of items to keep
  const MAX_MEMORY_ITEMS = 15; // Reduced from 50 to 20
  const MAX_UNPROCESSED_ITEMS = 10; // Reduced from 20 to 10
  const MAX_CHAIN_LENGTH = 30; // New limit for overall chain length

  // Keep all unprocessed items plus some history
  workingMemory.results = [
    ...workingMemory.results
      .filter((r) => !r.processed)
      .slice(-MAX_UNPROCESSED_ITEMS),
    ...workingMemory.results
      .filter((r) => r.processed)
      .slice(-MAX_MEMORY_ITEMS),
  ];

  workingMemory.outputs = [
    ...workingMemory.outputs
      .filter((o) => !o.processed)
      .slice(-MAX_UNPROCESSED_ITEMS),
    ...workingMemory.outputs
      .filter((o) => o.processed)
      .slice(-MAX_MEMORY_ITEMS),
  ];

  // Keep recent history for context
  workingMemory.thoughts = workingMemory.thoughts.slice(-MAX_MEMORY_ITEMS);
  workingMemory.calls = workingMemory.calls.slice(-MAX_MEMORY_ITEMS);

  // Also trim inputs once they're all processed
  if (workingMemory.inputs.every((i) => i.processed)) {
    workingMemory.inputs = workingMemory.inputs.slice(-MAX_MEMORY_ITEMS);
  }

  // Ensure the total number of items across all categories doesn't exceed a reasonable limit
  const totalItems =
    workingMemory.inputs.length +
    workingMemory.outputs.length +
    workingMemory.thoughts.length +
    workingMemory.calls.length +
    workingMemory.results.length;

  // If we still have too many items, trim more aggressively
  if (totalItems > MAX_CHAIN_LENGTH * 2) {
    const trimFactor = (MAX_CHAIN_LENGTH * 2) / totalItems;
    const newMaxItems = Math.floor(MAX_MEMORY_ITEMS * trimFactor);
    const newMaxUnprocessed = Math.floor(MAX_UNPROCESSED_ITEMS * trimFactor);

    // Re-trim everything more aggressively
    workingMemory.results = [
      ...workingMemory.results
        .filter((r) => !r.processed)
        .slice(-newMaxUnprocessed),
      ...workingMemory.results.filter((r) => r.processed).slice(-newMaxItems),
    ];

    workingMemory.outputs = [
      ...workingMemory.outputs
        .filter((o) => !o.processed)
        .slice(-newMaxUnprocessed),
      ...workingMemory.outputs.filter((o) => o.processed).slice(-newMaxItems),
    ];

    workingMemory.thoughts = workingMemory.thoughts.slice(-newMaxItems);
    workingMemory.calls = workingMemory.calls.slice(-newMaxItems);
    workingMemory.inputs = workingMemory.inputs.slice(-newMaxItems);
  }
}
