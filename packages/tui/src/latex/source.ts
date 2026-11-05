import { render, width } from "./box"
import { layout } from "./layout"
import { parse } from "./parse"

/**
 * Single-line Unicode rendering, suitable for splicing into a paragraph.
 *
 * This module renders arbitrary model output, so both entry points are total:
 * math that cannot be parsed *or* laid out yields undefined and the caller keeps
 * the original source rather than the render failing.
 */
export function renderInlineMath(tex: string): string | undefined {
  const nodes = parse(tex, false)
  if (!nodes) return undefined
  try {
    const text = layout(nodes, "inline").lines.join(" ").trim()
    return text || undefined
  } catch {
    return undefined
  }
}

/** Multi-line Unicode rendering for a display equation. */
export function renderDisplayMath(tex: string): string[] | undefined {
  const nodes = parse(tex, true)
  if (!nodes) return undefined
  try {
    const lines = render(layout(nodes, "display"))
    return lines.some((line) => line.length > 0) ? lines : undefined
  } catch {
    return undefined
  }
}

/** The body of a paragraph that is nothing but a `$$…$$` block. */
export function matchDisplayBlock(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("$$") || !trimmed.endsWith("$$") || trimmed.length < 5) return undefined
  const body = trimmed.slice(2, -2).trim()
  return body || undefined
}

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

/** `between $5 and $10` is prose, `$x^2$` is math. */
function isCurrency(tex: string): boolean {
  return /^\d/.test(tex) && !/[\\^_]/.test(tex)
}

/**
 * Models write `$$…$$` mid-sentence for small results — "its value is $$\sqrt{\pi}$$."
 * Breaking those onto their own line strands the sentence, so a short one that
 * continues the surrounding prose is spliced in as inline math instead.
 */
function continuesSentence(tex: string, before: string, after: string): string | undefined {
  // A blank line above it is the model deliberately setting the equation apart.
  if (/\n[ \t]*$/.test(before)) return undefined

  const preceding = before.slice(before.lastIndexOf("\n\n") + 1).trim()
  const adjacent = (preceding.length > 0 && !/[.:!?]$/.test(preceding)) || /^[^\n]*\S/.test(after)
  if (!adjacent) return undefined

  // `^(…)`/`_(…)` mean the inline pass had to fall back to ASCII scripts. Those read
  // far worse than the 2D form, so anything that degraded stays a display block.
  const text = renderInlineMath(tex)
  if (!text || /[\^_]/.test(text) || width(text) > INLINE_DISPLAY_WIDTH) return undefined
  return text
}

function transformText(text: string): string {
  // Otherwise display math becomes its own paragraph, so `marked` hands it to the
  // renderer as a standalone block even with prose on the lines around it.
  const separate = (match: string, lead: string, tex: string, offset: number, whole: string) => {
    const before = whole.slice(0, offset)
    const inline = continuesSentence(tex, before, whole.slice(offset + match.length))
    if (inline) return lead ? ` ${inline}` : inline
    return renderDisplayMath(tex) ? `\n\n$$\n${tex.trim()}\n$$\n\n` : match
  }

  return text
    .replace(DISPLAY_BRACKET, separate)
    .replace(DISPLAY_DOLLAR, separate)
    .replace(INLINE_PAREN, (match, tex: string) => renderInlineMath(tex) ?? match)
    .replace(INLINE_DOLLAR, (match, tex: string) => (isCurrency(tex) ? match : (renderInlineMath(tex) ?? match)))
}

/** Transform everything except inline code spans, which `split` hands back at odd indices. */
function transformSegment(segment: string): string {
  return segment
    .split(CODE_SPAN)
    .map((part, index) => (index % 2 === 1 ? part : transformText(part)))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
}

/**
 * Rewrites the math in a markdown source: inline spans become Unicode, display
 * blocks are normalized to a standalone `$$…$$` paragraph. Fenced code blocks and
 * inline code spans are left alone, as is anything that fails to parse.
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
