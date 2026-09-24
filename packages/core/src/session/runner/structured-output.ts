import { SystemPart } from "@opencode/ai"
import { Effect } from "effect"
import type { Tool } from "../../tool.js"

export const NAME = "StructuredOutput"

const DESCRIPTION = `Use this tool to return your final response in the requested structured format.

IMPORTANT:
- You MUST call this tool exactly once at the end of your response
- The input must be valid JSON matching the required schema
- Complete all necessary research and tool calls BEFORE calling this tool
- This tool provides your final answer - no further actions are taken after calling it`

export const SYSTEM = SystemPart.make(
  `IMPORTANT: The user has requested structured output. You MUST use the ${NAME} tool to provide your final response. Do NOT respond with plain text - you MUST call the ${NAME} tool with your answer formatted according to the schema.`,
)

/** Adds the StructuredOutput tool to `tools`; `onCall` runs when the model returns its answer. */
export const withTool = (tools: Tool.Snapshot, schema: Record<string, unknown>, onCall: () => void): Tool.Snapshot => {
  const { $schema: _, ...inputSchema } = schema
  return {
    ...tools,
    definitions: [...tools.definitions, { type: "tool", name: NAME, description: DESCRIPTION, inputSchema }],
    execute: (input) =>
      input.call.name === NAME
        ? Effect.sync(() => {
            onCall()
            return { content: [{ type: "text" as const, text: "Structured output captured successfully." }] }
          })
        : tools.execute(input),
  }
}
