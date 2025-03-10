import zodToJsonSchema from "zod-to-json-schema";
import type {
  Action,
  InputRef,
  Log,
  Output,
  OutputRef,
  XMLElement,
} from "./types";
import { formatXml } from "./xml";
import { formatValue } from "./utils";

/**
 * Custom serializer to handle BigInt values
 * @param obj - The object to serialize
 * @param indent - The indentation level (default: 2)
 * @returns The serialized string
 */
function customStringify(obj: any, indent = 2): string {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString() + 'n';
    }
    return value;
  }, indent);
}

/**
 * Formats an input reference into XML format
 * @param input - The input reference to format
 * @returns XML string representation of the input
 */
export function formatInput(input: InputRef) {
  return formatXml({
    tag: "input",
    params: { name: input.type, ...input.params },
    content:
      typeof input.data === "string" ? input.data : customStringify(input.data),
  });
}

/**
 * Formats an output reference into XML format
 * @param output - The output reference to format
 * @returns XML string representation of the output
 */
export function formatOutput(output: OutputRef) {
  return formatXml({
    tag: "output",
    params: { name: output.type, ...output.params },
    content:
      typeof output.data === "string"
        ? output.data
        : customStringify(output.data),
  });
}

/**
 * Formats an output interface definition into XML format
 * @param output - The output interface to format
 * @returns XML string representation of the output interface
 */
export function formatOutputInterface(output: Output) {
  return formatXml({
    tag: "output",
    params: { name: output.type },
    content: [
      output.description
        ? { tag: "description", content: output.description }
        : null,
      output.instructions
        ? { tag: "instructions", content: output.instructions }
        : null,
      {
        tag: "schema",
        content: JSON.stringify(zodToJsonSchema(output.schema, "output")),
      },
    ].filter((c) => !!c),
  });
}

export function formatAction(action: Action<any, any, any>) {
  return formatXml({
    tag: "action",
    params: { name: action.name },
    content: customStringify(zodToJsonSchema(action.schema, "action")),
  });
}

export function formatContext({
  type,
  key,
  description,
  instructions,
  content,
}: {
  type: string;
  key: string;
  description?: string | string[];
  instructions?: string | string[];
  content: XMLElement["content"];
}) {
  return formatXml({
    tag: "context",
    params: { type, key },
    content: [
      description
        ? formatXml({ tag: "description", content: description })
        : "",
      instructions
        ? formatXml({
            tag: "instructions",
            content: instructions,
          })
        : "",
      content,
    ]
      .filter((t) => !!t)
      .flat(),
  });
}

export type Msg =
  | {
      role: "user";
      user: string;
      content: string;
    }
  | {
      role: "assistant";
      content: string;
    };

export function formatMsg(msg: Msg) {
  return formatXml({
    tag: "msg",
    params:
      msg.role === "user"
        ? {
            role: "user",
            user: msg.user,
          }
        : { role: "assistant" },
    content: msg.content,
  });
}

export function formatContextLog(i: Log) {
  switch (i.ref) {
    case "input":
      return (
        i.formatted ??
        formatXml({
          tag: "msg",
          params: {
            ...i.params,
            role: "user",
          },
          content: formatValue(i.data),
        })
      );
    case "output":
      return (
        i.formatted ??
        formatXml({
          tag: "output",
          params: {
            type: i.type,
            ...i.params,
            // role: "assistant",
          },
          content: formatValue(i.data),
        })
      );
    case "thought":
      return formatXml({
        tag: "reasoning",
        // params: { role: "assistant" },
        content: i.content,
      });
    case "action_call":
      return formatXml({
        tag: "action_call",
        params: { name: i.name, id: i.id },
        content: customStringify(i.data),
      });
    case "action_result":
      return formatXml({
        tag: "action_result",
        params: { name: i.name, id: i.callId },
        content: i.formatted ?? customStringify(i.data),
      });
    default:
      throw new Error("invalid context");
  }
}
