import { expect, test } from "bun:test"
import { Schema } from "effect"
import { SessionV1 } from "../src/v1/session.js"

test.each([
  { type: "text" },
  { type: "json_schema", schema: { type: "object" }, retryCount: 1 },
  { type: "json_schema", schema: { type: "object" } },
])("encodes persisted messages with format $type", (format) => {
  const messages = Schema.Array(SessionV1.Info)
  const decoded = Schema.decodeUnknownSync(messages)([
    {
      id: "msg_format",
      sessionID: "ses_format",
      role: "user",
      time: { created: 0 },
      agent: "build",
      model: { providerID: "test", modelID: "test" },
      format,
    },
  ])
  const stored = JSON.parse(JSON.stringify(decoded))
  expect(Schema.encodeSync(messages)(stored)).toEqual(stored)
  expect(stored[0].format).toEqual(
    format.type === "json_schema" ? { ...format, retryCount: format.retryCount ?? 2 } : format,
  )
})
