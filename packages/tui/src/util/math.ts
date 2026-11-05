import { parseLatex } from "@opencode/latex/parser"
import { printInlineMath } from "./math-inline"
import { stringWidth } from "./string-width"

const FENCE = /^\s{0,3}(```+|~~~+)/
const CODE_SPAN = /(`+[^`]*`+)/
// The leading whitespace is part of the match so an inlined block can absorb the
// line break the model put in front of it.
const DISPLAY_BRACKET = /([ \t]*\n?[ \t]*)\\\[([\s\S]+?)\\\]/g
const DISPLAY_DOLLAR = /([ \t]*\n?[ \t]*)\$\$([\s\S]+?)\$\$/g
const INLINE_PAREN = /\\\(([\s\S]+?)\\\)/g
const INLINE_DOLLAR = /\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$/g
/** Past this width a mid-sentence `$$…$$` is a real equation, not a value. */
const INLINE_DISPLAY_WIDTH = 32

/**
 * Rewrites the math in a markdown source so the built-in LaTeX plugin can draw it:
 * display blocks (`$$…$$`, `\[…\]`) become fenced `math` code blocks, and inline
 * spans (`$…$`, `\(…\)`) that fit on one line become Unicode. Fenced code blocks
 * and inline code spans are left alone, as is anything that fails to parse.
 */
export function transformMathSource(source: string): string {
  if (!/\$|\\\(|\\\[/.test(source)) return source

  const out: string[] = []
  let buffer: string[] = []
  let fence: string | undefined

  const flush = () => {
    if (buffer.length === 0) return
    out.push(transformSegment(buffer.join("\n")))
    buffer = []
  }

  for (const line of source.split("\n")) {
    const match = line.match(FENCE)
    if (fence !== undefined) {
      out.push(line)
      if (match && line.trim().startsWith(fence)) fence = undefined
      continue
    }
    if (match) {
      flush()
      out.push(line)
      fence = match[1]
      continue
    }
    buffer.push(line)
  }
  flush()

  return out.join("\n").trim()
}

/** Transform everything except inline code spans, which `split` hands back at odd indices. */
function transformSegment(segment: string): string {
  return segment
    .split(CODE_SPAN)
    .map((part, index) => (index % 2 === 1 ? part : transformText(part)))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
}

function transformText(text: string): string {
  // A fenced block is its own markdown block even with prose on the lines around it.
  const separate = (match: string, lead: string, tex: string, offset: number, whole: string) => {
    const inline = continuesSentence(tex, whole.slice(0, offset), whole.slice(offset + match.length))
    if (inline) return lead ? ` ${inline}` : inline
    return parse(tex) ? `\n\n\`\`\`math\n${tex.trim()}\n\`\`\`\n\n` : match
  }

  return text
    .replace(DISPLAY_BRACKET, separate)
    .replace(DISPLAY_DOLLAR, separate)
    .replace(INLINE_PAREN, (match, tex: string) => renderInline(tex) ?? match)
    .replace(INLINE_DOLLAR, (match, tex: string) => (isCurrency(tex) ? match : (renderInline(tex) ?? match)))
}

/**
 * Models write `$$…$$` mid-sentence for small results — "its value is $$x^2$$."
 * Breaking those onto their own line strands the sentence, so a short one that
 * continues the surrounding prose is spliced in as inline math instead.
 */
function continuesSentence(tex: string, before: string, after: string): string | undefined {
  // A blank line above it is the model deliberately setting the equation apart.
  if (/\n[ \t]*$/.test(before)) return undefined

  const preceding = before.slice(before.lastIndexOf("\n\n") + 1).trim()
  const adjacent = (preceding.length > 0 && !/[.:!?]$/.test(preceding)) || /^[^\n]*\S/.test(after)
  if (!adjacent) return undefined

  const text = renderInline(tex)
  // An ASCII `^`/`_` fallback reads worse than the drawn display form.
  if (!text || /[\^_]/.test(text) || stringWidth(text) > INLINE_DISPLAY_WIDTH) return undefined
  return text
}

/** `between $5 and $10` is prose, `$x^2$` is math. */
function isCurrency(tex: string): boolean {
  return /^\d/.test(tex) && !/[\\^_]/.test(tex)
}

/** Only math with a one-line form can be spliced into a paragraph. */
function renderInline(tex: string): string | undefined {
  const node = parse(tex)
  return (node && printInlineMath(node)?.trim()) || undefined
}

// This runs on arbitrary model output, so math that cannot be parsed keeps its source.
function parse(tex: string) {
  try {
    return parseLatex(tex, { strict: true })
  } catch {
    return undefined
  }
}
