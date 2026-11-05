/**
 * The TeX box model, reduced to character cells.
 *
 * A `Box` is a rectangle of text plus the index of its baseline row. Horizontal
 * composition aligns baselines, which is what makes `x^2 + \frac{a}{b}` line up.
 * Every line is padded to exactly `width` columns.
 */
export interface Box {
  lines: string[]
  baseline: number
  width: number
}

const COMBINING = /[̀-ͯ⃐-⃿]/

/** Terminal columns a string occupies. Combining marks stack onto the previous cell. */
export function width(text: string): number {
  let total = 0
  for (const char of text) {
    if (COMBINING.test(char)) continue
    total += 1
  }
  return total
}

function pad(line: string, to: number): string {
  return line + " ".repeat(Math.max(0, to - width(line)))
}

export function box(text: string): Box {
  return { lines: [text], baseline: 0, width: width(text) }
}

export const EMPTY: Box = { lines: [""], baseline: 0, width: 0 }

export function isBlank(b: Box): boolean {
  return b.width === 0 && b.lines.length === 1
}

/** Re-pad every line to `to` columns, optionally centering the existing content. */
export function resize(b: Box, to: number, align: "left" | "center" | "right" = "left"): Box {
  const lines = b.lines.map((line) => {
    const slack = to - width(line)
    if (slack <= 0) return line
    if (align === "left") return line + " ".repeat(slack)
    if (align === "right") return " ".repeat(slack) + line
    const left = Math.floor(slack / 2)
    return " ".repeat(left) + line + " ".repeat(slack - left)
  })
  return { lines, baseline: b.baseline, width: Math.max(b.width, to) }
}

/** Place boxes side by side, aligned on their baselines. */
export function hcat(boxes: Box[]): Box {
  const parts = boxes.filter((b) => b.lines.length > 0)
  if (parts.length === 0) return EMPTY
  if (parts.length === 1) return parts[0]

  const above = Math.max(...parts.map((b) => b.baseline))
  const below = Math.max(...parts.map((b) => b.lines.length - b.baseline - 1))
  const height = above + below + 1

  const lines: string[] = Array.from({ length: height }, () => "")
  for (const part of parts) {
    const offset = above - part.baseline
    for (let row = 0; row < height; row++) {
      const line = part.lines[row - offset]
      lines[row] += line === undefined ? " ".repeat(part.width) : pad(line, part.width)
    }
  }

  const total = parts.reduce((sum, b) => sum + b.width, 0)
  return { lines, baseline: above, width: total }
}

/** Stack `top` over `bottom`; the baseline lands on the separator row. */
export function fraction(top: Box, bottom: Box, rule: boolean): Box {
  const inner = Math.max(top.width, bottom.width)
  const total = inner + 2
  const numer = resize(top, total, "center")
  const denom = resize(bottom, total, "center")
  const separator = rule ? "─".repeat(total) : " ".repeat(total)
  return {
    lines: [...numer.lines, separator, ...denom.lines],
    baseline: numer.lines.length,
    width: total,
  }
}

/** Attach limits above and/or below a base without moving its baseline. */
export function overUnder(base: Box, over: Box | undefined, under: Box | undefined): Box {
  const total = Math.max(base.width, over?.width ?? 0, under?.width ?? 0)
  const centered = resize(base, total, "center")
  const top = over ? resize(over, total, "center").lines : []
  const bottom = under ? resize(under, total, "center").lines : []
  return {
    lines: [...top, ...centered.lines, ...bottom],
    baseline: top.length + centered.baseline,
    width: total,
  }
}

/** A rule drawn across the full width of `b`, above or below it. */
export function bar(b: Box, side: "over" | "under"): Box {
  const rule = "‾".repeat(b.width)
  const under = "_".repeat(b.width)
  return side === "over"
    ? { lines: [rule, ...b.lines], baseline: b.baseline + 1, width: b.width }
    : { lines: [...b.lines, under], baseline: b.baseline, width: b.width }
}

const DELIMITERS: Record<string, [string, string, string, string]> = {
  // top, extension, bottom, middle
  "(": ["⎛", "⎜", "⎝", "⎜"],
  ")": ["⎞", "⎟", "⎠", "⎟"],
  "[": ["⎡", "⎢", "⎣", "⎢"],
  "]": ["⎤", "⎥", "⎦", "⎥"],
  "{": ["⎧", "⎪", "⎩", "⎨"],
  "}": ["⎫", "⎪", "⎭", "⎬"],
  "⌊": ["⎢", "⎢", "⎣", "⎢"],
  "⌋": ["⎥", "⎥", "⎦", "⎥"],
  "⌈": ["⎡", "⎢", "⎢", "⎢"],
  "⌉": ["⎤", "⎥", "⎥", "⎥"],
  "|": ["│", "│", "│", "│"],
  "‖": ["║", "║", "║", "║"],
  "⟨": ["╱", "│", "╲", "│"],
  "⟩": ["╲", "│", "╱", "│"],
}

function fence(delim: string, height: number, baseline: number): Box | undefined {
  if (delim === "." || delim === "") return undefined
  if (height === 1) return box(delim)
  const pieces = DELIMITERS[delim]
  if (!pieces) return { lines: Array.from({ length: height }, () => delim), baseline, width: width(delim) }
  const [top, extension, bottom, middle] = pieces
  const center = Math.floor((height - 1) / 2)
  const lines = Array.from({ length: height }, (_, row) => {
    if (row === 0) return top
    if (row === height - 1) return bottom
    return middle !== extension && row === center ? middle : extension
  })
  return { lines, baseline, width: 1 }
}

export function delimit(left: string, body: Box, right: string): Box {
  const height = body.lines.length
  const parts = [fence(left, height, body.baseline), body, fence(right, height, body.baseline)]
  return hcat(parts.filter((b): b is Box => b !== undefined))
}

/** Lay out a grid of cells with each column aligned per `align`. */
export function grid(rows: Box[][], align: ("l" | "c" | "r")[], gutter = 2): Box {
  const columns = Math.max(...rows.map((row) => row.length))
  const widths: number[] = []
  for (let col = 0; col < columns; col++) {
    widths.push(Math.max(0, ...rows.map((row) => row[col]?.width ?? 0)))
  }

  const laid = rows.map((row) => {
    const cells: Box[] = []
    for (let col = 0; col < columns; col++) {
      const cell = row[col] ?? EMPTY
      const alignment = align[col] === "l" ? "left" : align[col] === "r" ? "right" : "center"
      cells.push(resize(cell, widths[col], alignment))
      if (col < columns - 1) cells.push(box(" ".repeat(gutter)))
    }
    return hcat(cells)
  })

  return vcat(laid)
}

/** Stack boxes vertically; the baseline lands on the vertical middle. */
export function vcat(boxes: Box[]): Box {
  const parts = boxes.filter((b) => b.lines.length > 0)
  if (parts.length === 0) return EMPTY
  const total = Math.max(...parts.map((b) => b.width))
  const lines = parts.flatMap((b) => resize(b, total).lines)
  return { lines, baseline: Math.floor((lines.length - 1) / 2), width: total }
}

export function render(b: Box): string[] {
  return b.lines.map((line) => line.replace(/\s+$/, ""))
}
