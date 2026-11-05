import { ACCENTS, BLACKBOARD, SUBSCRIPT, SUPERSCRIPT, SYMBOLS } from "./symbols"
import {
  bar,
  box,
  delimit,
  EMPTY,
  fraction,
  grid,
  hcat,
  isBlank,
  overUnder,
  resize,
  type Box,
} from "./box"
import type { MathNode } from "./parse"

/**
 * `inline` collapses everything to a single line so the result can be spliced
 * back into a paragraph; `display` is free to use vertical space.
 */
export type MathMode = "inline" | "display"

export function layout(nodes: MathNode[], mode: MathMode): Box {
  return sequence(nodes, mode)
}

function symbol(name: string | undefined): string {
  if (!name) return ""
  return SYMBOLS[name] ?? name
}

function children(node: MathNode["body"] | undefined, mode: MathMode): Box {
  if (!node) return EMPTY
  if (Array.isArray(node)) return sequence(node.flat() as MathNode[], mode)
  return render(node, mode)
}

type Spacing = { before: boolean; after: boolean }

function classOf(node: MathNode): string | undefined {
  if (node.type === "atom") return node.family
  if (node.type === "mclass" && node.mclass) return node.mclass.replace(/^m/, "")
  if (node.type === "htmlmathml" && node.mathml?.length === 1) return classOf(node.mathml[0])
  return undefined
}

function spacingOf(node: MathNode, index: number, previous: string | undefined): Spacing {
  const family = classOf(node)
  if (family === "punct") return { before: false, after: true }
  if (family !== "bin" && family !== "rel") return { before: false, after: false }
  // A binary operator with nothing to bind to on the left is unary: `-x`, not `- x`.
  const unary = family === "bin" && (index === 0 || previous === "bin" || previous === "rel" || previous === "open")
  return { before: !unary, after: !unary }
}

function sequence(nodes: MathNode[], mode: MathMode): Box {
  const items = nodes.map((node, index) => ({
    box: render(node, mode),
    space: spacingOf(node, index, index > 0 ? classOf(nodes[index - 1]) : undefined),
    node,
  }))

  const parts: Box[] = []
  for (let i = 0; i < items.length; i++) {
    const gap = i > 0 && (items[i].space.before || items[i - 1].space.after || followsOperator(items[i - 1].node))
    if (gap) parts.push(box(" "))
    parts.push(items[i].box)
  }
  return hcat(parts)
}

/** `\log x` and `\sum x_i` read better with a space before their operand. */
function followsOperator(node: MathNode): boolean {
  if (node.type === "op" || node.type === "operatorname") return true
  return node.type === "supsub" && node.base !== undefined && followsOperator(node.base)
}

/** TeX sets scripts tight: `\sum_{i = 1}` reads as `i=1`, not `i = 1`. */
function tighten(b: Box | undefined): Box | undefined {
  if (!b || b.lines.length !== 1) return b
  return box(b.lines[0].replace(/ ([-+=<>≤≥≠]) /g, "$1"))
}

/** Map a single-line box through the Unicode super/subscript alphabet, if it covers every character. */
function script(source: Box | undefined, map: Record<string, string>): string | undefined {
  if (!source) return undefined
  if (source.lines.length !== 1) return undefined
  let out = ""
  for (const char of source.lines[0].trim()) {
    const mapped = map[char]
    if (!mapped) return undefined
    out += mapped
  }
  return out
}

function flatten(b: Box): string {
  return b.lines.map((line) => line.trim()).join(" ")
}

/** Parenthesise an inline sub-expression unless it is a single atom. */
function group(text: string): string {
  return /[\s+\-−±×÷=<>/]/.test(text) ? `(${text})` : text
}

function corner(base: Box, sup: Box | undefined, sub: Box | undefined): Box {
  const width = Math.max(sup?.width ?? 0, sub?.width ?? 0)
  const top = sup ? resize(sup, width).lines : []
  const bottom = sub ? resize(sub, width).lines : []
  const scripts: Box = {
    lines: [...top, " ".repeat(width), ...bottom],
    baseline: top.length,
    width,
  }
  return hcat([base, scripts])
}

function supsub(node: MathNode, mode: MathMode): Box {
  const base = node.base ? render(node.base, mode) : EMPTY
  const sup = tighten(node.sup ? children(node.sup, mode) : undefined)
  const sub = tighten(node.sub ? children(node.sub, mode) : undefined)

  const limits = node.base?.limits === true && (node.base.type === "op" || node.base.type === "operatorname")
  if (mode === "display" && limits) return overUnder(base, sup, sub)

  const superscript = script(sup, SUPERSCRIPT)
  const subscript = script(sub, SUBSCRIPT)
  if ((!sup || superscript !== undefined) && (!sub || subscript !== undefined)) {
    return hcat([base, box((subscript ?? "") + (superscript ?? ""))])
  }

  if (mode === "display") return corner(base, sup, sub)

  const parts = [base]
  if (sub) parts.push(box("_" + group(flatten(sub))))
  if (sup) parts.push(box("^" + group(flatten(sup))))
  return hcat(parts)
}

function genfrac(node: MathNode, mode: MathMode): Box {
  const numerator = children(node.numer, mode)
  const denominator = children(node.denom, mode)
  const rule = node.hasBarLine !== false

  if (mode === "display") {
    const stacked = fraction(numerator, denominator, rule)
    if (node.leftDelim || node.rightDelim) return delimit(node.leftDelim ?? ".", stacked, node.rightDelim ?? ".")
    return stacked
  }

  const top = flatten(numerator)
  const bottom = flatten(denominator)
  if (!rule) return box(`C(${top}, ${bottom})`)
  return box(`${group(top)}/${group(bottom)}`)
}

/**
 * `√(x + 1)` rather than an overlined radicand: a rule drawn above the body
 * leaves a stray macron floating on its own row, which reads as a rendering
 * artifact in a terminal. Multi-row radicands get grown parentheses instead.
 */
function radical(node: MathNode, mode: MathMode): Box {
  const body = children(node.body as MathNode, mode)
  const index = node.index ? children(node.index, mode) : undefined
  const degree = (index && script(index, SUPERSCRIPT)) ?? ""

  if (body.lines.length === 1) return box(`${degree}√${group(flatten(body))}`)
  return hcat([box(`${degree}√`), delimit("(", body, ")")])
}

function array(node: MathNode, mode: MathMode): Box {
  const rows = (node.body as MathNode[][]) ?? []
  const align = (node.cols ?? [])
    .filter((col) => col.type === "align")
    .map((col) => (col.align === "l" ? "l" : col.align === "r" ? "r" : "c") as "l" | "c" | "r")
  return grid(
    rows.map((row) => row.map((cell) => render(cell, mode))),
    align,
  )
}

function accent(node: MathNode, mode: MathMode): Box {
  const base = children(node.body ?? node.base, mode)
  const mark = node.label ? ACCENTS[node.label] : undefined
  if (mark && base.lines.length === 1 && base.width === 1) {
    return box(base.lines[0] + mark)
  }
  return bar(base, "over")
}

function operatorName(node: MathNode): string {
  if (node.name) return node.name.replace(/^\\(operatorname\*?)?/, "")
  const body = node.body
  if (Array.isArray(body)) return (body as MathNode[]).map((child) => symbol(child.text)).join("")
  return ""
}

function textOf(node: MathNode): string {
  if (node.text !== undefined) return symbol(node.text)
  const body = node.body
  if (Array.isArray(body)) return (body as MathNode[]).map(textOf).join("")
  if (body) return textOf(body as MathNode)
  return ""
}

function render(node: MathNode, mode: MathMode): Box {
  switch (node.type) {
    case "ordgroup":
    case "styling":
    case "sizing":
    case "color":
    case "mclass":
    case "pmb":
    case "enclose":
    case "raisebox":
    case "lap":
    case "vcenter":
      return children(node.body, mode)

    case "mathord":
    case "textord":
    case "atom":
    case "spacing":
      return box(symbol(node.text))

    case "supsub":
      return supsub(node, mode)

    case "genfrac":
      return genfrac(node, mode)

    case "sqrt":
      return radical(node, mode)

    case "op":
      return box(node.symbol ? symbol(node.name) : operatorName(node))

    case "operatorname":
      return box(operatorName(node))

    case "leftright":
      return delimit(symbol(node.left), children(node.body, mode), symbol(node.right))

    case "delimsizing":
    case "middle":
      return box(symbol(node.delim))

    case "array":
      return array(node, mode)

    case "text":
      return box(textOf(node))

    case "font":
      if (node.font === "mathbb") {
        const base = children(node.body, mode)
        return { ...base, lines: base.lines.map((line) => line.replace(/[A-Z]/g, (c) => BLACKBOARD[c] ?? c)) }
      }
      return children(node.body, mode)

    case "accent":
      return accent(node, mode)

    case "overline":
      return bar(children(node.body, mode), "over")

    case "underline":
      return bar(children(node.body, mode), "under")

    case "htmlmathml":
      return sequence(node.mathml ?? [], mode)

    case "horizBrace":
      return children(node.base, mode)

    case "phantom":
    case "vphantom":
    case "hphantom": {
      const hidden = children(node.body, mode)
      return isBlank(hidden) ? EMPTY : box(" ".repeat(hidden.width))
    }

    case "kern":
    case "rule":
      return EMPTY

    default:
      if (node.text !== undefined) return box(symbol(node.text))
      if (node.body) return children(node.body as MathNode | MathNode[], mode)
      return EMPTY
  }
}
