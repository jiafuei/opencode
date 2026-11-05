import { layoutMath } from "@opencode/latex/layout"
import type { MathNode } from "@opencode/latex/types"

const zip = (from: string, to: string) => new Map(Array.from(from, (char, index) => [char, Array.from(to)[index]]))

const SUPERSCRIPT = zip(
  "0123456789+-=()abcdefghijklmnoprstuvwxyzABDEGHIJKLMNOPRTUVWαβγδεθιϕφχ′",
  "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂᵅᵝᵞᵟᵋᶿᶥᵠᵠᵡ′",
)
const SUBSCRIPT = zip("0123456789+-=()aehijklmnoprstuvxβγρϕφχ", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵩᵪ")
const ROOTS: Record<string, string> = { "": "√", "3": "∛", "4": "∜" }
// Unicode combining marks, appended after the character they decorate.
const MARKS = {
  hat: "\u0302",
  widehat: "\u0302",
  bar: "\u0304",
  overline: "\u0305",
  underline: "\u0332",
  vec: "\u20d7",
  tilde: "\u0303",
  dot: "\u0307",
  ddot: "\u0308",
}

/**
 * Prints parsed math on one line, or returns undefined when it has no sensible
 * one-line form. Multi-row constructs are rewritten into single-row nodes so
 * upstream's layout still owns spacing, variants and delimiters.
 */
export function printInlineMath(node: MathNode): string | undefined {
  const line = inline(node)
  return line && layoutMath(line).toString()
}

function inline(node: MathNode): MathNode | undefined {
  switch (node.type) {
    case "symbol":
    case "text":
    case "space":
    case "operator":
      return node
    case "row": {
      const body = node.body.map(inline)
      return body.every((item) => item !== undefined) ? { type: "row", body } : undefined
    }
    case "variant":
    case "color":
    case "delimited": {
      const body = inline(node.body)
      return body && { ...node, body }
    }
    case "fraction": {
      const numerator = inline(node.numerator)
      const denominator = inline(node.denominator)
      if (!node.bar || !numerator || !denominator) return undefined
      return {
        type: "row",
        body: [group(node.numerator, numerator), { type: "symbol", value: "/" }, group(node.denominator, denominator)],
      }
    }
    case "root": {
      const body = inline(node.body)
      const index = node.index ? flat(node.index) : ""
      const radical = index === undefined ? undefined : (ROOTS[index] ?? convert(index, SUPERSCRIPT)?.concat("√"))
      if (!body || !radical) return undefined
      return { type: "row", body: [{ type: "symbol", value: radical }, group(node.body, body)] }
    }
    case "accent": {
      const body = flat(node.body)
      const chars = Array.from(body ?? "")
      const spans = node.accent === "bar" || node.accent === "overline" || node.accent === "underline"
      if (!body || (chars.length > 1 && !spans)) return undefined
      return { type: "text", value: chars.map((char) => char + MARKS[node.accent]).join("") }
    }
    case "scripts":
      return scripts(node)
    case "matrix":
    case "brace":
    case "overunder":
      return undefined
  }
}

/**
 * Unicode scripts when every character has a form (subscript first, as in `\sum_{i=1}^n`),
 * otherwise ASCII `_`/`^` for both so a mixed `a_b^c` stays unambiguous.
 */
function scripts(node: Extract<MathNode, { type: "scripts" }>): MathNode | undefined {
  const base = inline(node.base)
  const subscript = node.subscript ? flat(node.subscript) : ""
  const superscript = node.superscript ? flat(node.superscript) : ""
  if (!base || subscript === undefined || superscript === undefined) return undefined

  const unicode = [convert(subscript, SUBSCRIPT), convert(superscript, SUPERSCRIPT)]
  const suffix = unicode.every((part) => part !== undefined)
    ? unicode.join("")
    : ascii("_", subscript) + ascii("^", superscript)
  // Appending to a symbol or operator keeps its role, so `\sum_i x` keeps its operator spacing.
  if (base.type === "symbol" || base.type === "operator") return { ...base, value: base.value + suffix }
  return { type: "row", body: [base, { type: "text", value: suffix }] }
}

/** Parenthesise a fraction part or radicand unless it is a single atom or a plain number. */
function group(source: MathNode, line: MathNode): MathNode {
  const atomic =
    source.type === "row"
      ? source.body.every((item) => item.type === "symbol" && /^[\d.]$/.test(item.value))
      : source.type !== "fraction"
  if (atomic || line.type !== "row") return line
  // Binary operators sit tight inside the parentheses, as in `(a+1)/b`.
  const body = line.body.map((item) =>
    item.type === "symbol" && item.role === "binary" ? { ...item, role: "ordinary" as const } : item,
  )
  return { type: "delimited", left: "(", body: { type: "row", body }, right: ")" }
}

/** Scripts, root indices and accent bodies are printed tight, without math spacing. */
function flat(node: MathNode): string | undefined {
  const line = inline(node)
  return line && layoutMath(line).toString().replaceAll(" ", "")
}

function convert(text: string, table: Map<string, string>): string | undefined {
  const chars = Array.from(text)
  return chars.every((char) => table.has(char)) ? chars.map((char) => table.get(char)).join("") : undefined
}

function ascii(marker: string, text: string): string {
  if (text === "") return ""
  return Array.from(text).length === 1 ? marker + text : `${marker}(${text})`
}
