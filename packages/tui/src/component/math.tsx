import { TextRenderable, type MarkdownOptions, type RenderContext, type RGBA } from "@opentui/core"
import { matchDisplayBlock, renderDisplayMath } from "../latex"

type RenderNode = NonNullable<MarkdownOptions["renderNode"]>

/**
 * Renders `$$…$$` paragraphs as 2D Unicode math. Everything else — including math
 * that fails to parse — returns undefined and falls through to opentui's default
 * markdown rendering, so a half-streamed equation still shows its source.
 *
 * Create this once per `<markdown>`: `MarkdownRenderable` drops its block cache
 * whenever the `renderNode` identity changes. `fg` is read per block instead of
 * captured, because a theme switch re-runs this hook to rebuild the blocks.
 * Non-math tokens go to `fallback` (plugin code-block renderers).
 */
export function mathRenderNode(ctx: RenderContext, fg: () => RGBA, fallback?: RenderNode): RenderNode {
  let counter = 0
  return (token, context) => {
    const tex = token.type === "paragraph" ? matchDisplayBlock(token.raw) : undefined
    const lines = tex ? renderDisplayMath(tex) : undefined
    if (!lines) return fallback?.(token, context)

    return new TextRenderable(ctx, {
      id: `math-${counter++}`,
      content: lines.join("\n"),
      fg: fg(),
      wrapMode: "none",
      width: "100%",
      // An unset margin is NaN, and opentui merges ours with the block's via
      // Math.max — which NaN wins, collapsing the gap above the equation.
      marginTop: 0,
    })
  }
}
