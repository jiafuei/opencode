export * as ConfigCompaction from "./compaction.js"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt, optional } from "../schema.js"

export const Threshold = Schema.Union([
  PositiveInt,
  Schema.String.check(Schema.isPattern(/^(?:100(?:\.0+)?|[1-9]\d?(?:\.\d+)?|0\.\d*[1-9]\d*)%$/u)),
]).annotate({
  identifier: "Config.Compaction.Threshold",
  description: "Context tokens before automatic compaction: a positive integer or a percentage above 0% up to 100%",
})
export type Threshold = typeof Threshold.Type

export class Keep extends Schema.Class<Keep>("Config.Compaction.Keep")({
  tokens: NonNegativeInt.pipe(optional),
}) {}

export class Info extends Schema.Class<Info>("Config.Compaction")({
  auto: Schema.Boolean.pipe(optional),
  keep: Keep.pipe(optional),
  buffer: NonNegativeInt.pipe(optional),
  threshold: Threshold.pipe(optional),
}) {}
