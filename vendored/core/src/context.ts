import { z } from "zod";
import type { Context, WorkingMemory } from "./types";
import { formatContextLog } from "./formatters";
import { memory } from "./utils";

/**
 * Creates a context configuration
 * @template Memory - Type of working memory
 * @template Args - Zod schema type for context arguments
 * @template Ctx - Type of context data
 * @template Exports - Type of exported data
 * @param ctx - Context configuration object
 * @returns Typed context configuration
 */

export function context<
  Memory = any,
  Args extends z.ZodTypeAny = z.ZodTypeAny,
  Ctx = any,
  Exports = any,
>(
  ctx: Context<Memory, Args, Ctx, Exports>
): Context<Memory, Args, Ctx, Exports> {
  return ctx;
}

/**
 * Retrieves and sorts working memory logs
 * @param memory - Working memory object
 * @param includeThoughts - Whether to include thought logs (default: true)
 * @returns Sorted array of memory logs
 */
export function getWorkingMemoryLogs(
  memory: Partial<WorkingMemory>,
  includeThoughts = true
) {
  return [
    ...(memory.inputs ?? []),
    ...(memory.outputs ?? []),
    ...(memory.calls ?? []),
    ...((includeThoughts ? memory.thoughts : undefined) ?? []),
    ...(memory.results ?? []),
  ].sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
}

/**
 * Default renderer for context logs
 * @param options - Options containing the working memory
 * @param options.memory - Working memory to render
 * @returns Formatted context logs
 */
export function defaultContextRender({
  memory,
}: {
  memory: Partial<WorkingMemory>;
}) {
  return getWorkingMemoryLogs(memory, false)
    .map((i) => formatContextLog(i))
    .flat();
}

/**
 * Creates a default working memory object
 * @returns Empty working memory with initialized arrays
 */
export function createDefaultContextMemory(): WorkingMemory {
  return {
    inputs: [],
    outputs: [],
    thoughts: [],
    calls: [],
    results: [],
    isFinal: false,
  };
}

/**
 * Default working memory instance
 * Provides a memory container with standard working memory structure
 */
export const defaultWorkingMemory = memory<WorkingMemory>({
  key: "working-memory",
  create: createDefaultContextMemory,
});

/**
 * Default context configuration
 * Provides a basic context with string schema and test property
 */
export const defaultContext = context({
  type: "default",
  schema: z.string(),
  key: (key) => key,
  create(state) {
    return {
      test: true,
    };
  },
  // render: defaultContextRender,
});
