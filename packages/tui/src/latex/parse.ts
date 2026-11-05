import katex from "katex"

/**
 * Loose shape of a katex parse node. `katex.__parse` is not covered by
 * `@types/katex`, and the real node union is ~40 interfaces we only partially
 * care about, so the layout walker reads fields defensively off this.
 */
export interface MathNode {
  type: string
  text?: string
  name?: string
  label?: string
  font?: string
  mclass?: string
  family?: string
  limits?: boolean
  symbol?: boolean
  hasBarLine?: boolean
  leftDelim?: string | null
  rightDelim?: string | null
  left?: string
  right?: string
  delim?: string
  index?: MathNode | null
  base?: MathNode
  sup?: MathNode
  sub?: MathNode
  numer?: MathNode
  denom?: MathNode
  body?: MathNode | MathNode[] | MathNode[][]
  mathml?: MathNode[]
  html?: MathNode[]
  cols?: { type: string; align?: string }[]
}

const parser = katex as unknown as {
  __parse: (tex: string, settings?: Record<string, unknown>) => MathNode[]
}

/** Returns undefined for anything katex refuses to parse. */
export function parse(tex: string, displayMode: boolean): MathNode[] | undefined {
  try {
    return parser.__parse(tex, { displayMode, strict: false, throwOnError: true })
  } catch {
    return undefined
  }
}
