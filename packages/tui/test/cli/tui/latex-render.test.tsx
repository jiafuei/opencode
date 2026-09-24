import { afterEach, describe, expect, test } from "bun:test"
import { RGBA, SyntaxStyle } from "@opentui/core"
import { testRender, useRenderer, type JSX } from "@opentui/solid"
import { mathRenderNode } from "../../../src/component/math"
import { transformMathSource } from "../../../src/latex"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

const SOURCE = [
  "The energy is $E = mc^2$ where $c$ is constant.",
  "",
  "We arrive at:",
  "$$f(x) = \\frac{a+1}{b^2}$$",
  "which costs between $5 and $10.",
  "",
  "```sh",
  "echo $x^2$",
  "```",
].join("\n")

function Fixture(props: { content: string }) {
  const renderer = useRenderer()
  const renderNode = mathRenderNode(renderer, () => RGBA.fromValues(1, 1, 1, 1))
  return (
    <box flexDirection="column" width={48}>
      <markdown
        width="100%"
        syntaxStyle={SyntaxStyle.fromTheme([])}
        streaming={true}
        internalBlockMode="top-level"
        content={transformMathSource(props.content)}
        renderNode={renderNode}
      />
    </box>
  )
}

async function renderFrame(component: () => JSX.Element, options: { width: number; height: number }) {
  testSetup = await testRender(component, options)
  await testSetup.renderOnce()
  await testSetup.renderOnce()

  return testSetup
    .captureCharFrame()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()
}

describe("TUI LaTeX rendering", () => {
  test("renders inline and display math", async () => {
    const frame = await renderFrame(() => <Fixture content={SOURCE} />, { width: 48, height: 20 })

    expect(frame).toContain("E = mc²")
    expect(frame).toContain("a + 1")
    expect(frame).toContain("───────")
    // the currency guard survives into the rendered frame
    expect(frame).toContain("between $5 and $10")
    expect(frame).not.toContain("\\frac")
  })

  test("separates a display equation from the prose around it", async () => {
    const frame = await renderFrame(() => <Fixture content={SOURCE} />, { width: 48, height: 20 })

    expect(frame).toContain("We arrive at:\n\n")
    expect(frame).toContain("\n\nwhich costs between $5 and $10.")
  })

  test("keeps a short mid-sentence equation in the prose", async () => {
    const source = "It has no antiderivative, but its value is\n$$\\sqrt{\\pi}.$$\n\nDone."
    const frame = await renderFrame(() => <Fixture content={source} />, { width: 48, height: 10 })

    expect(frame).toContain("its value is √π.")
  })

  test("shows the source while an equation is still streaming", async () => {
    const partial = "We arrive at\n$$f(x) = \\frac{a+1}"
    const frame = await renderFrame(() => <Fixture content={partial} />, { width: 48, height: 8 })

    expect(frame).toContain("\\frac{a+1}")
    expect(frame).not.toContain("───")
  })
})
