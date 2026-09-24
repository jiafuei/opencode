import { describe, expect, test } from "bun:test"
import { matchDisplayBlock, renderDisplayMath, renderInlineMath, transformMathSource } from "../../../src/latex"

describe("inline math", () => {
  const cases: [string, string][] = [
    ["x^2", "x²"],
    ["e^{-x}", "e⁻ˣ"],
    ["\\alpha_i \\ge 0", "αᵢ ≥ 0"],
    ["x_{ij}", "xᵢⱼ"],
    ["a+b", "a + b"],
    ["-x + 1", "-x + 1"],
    ["\\frac{a+1}{b^2}", "(a + 1)/b²"],
    ["\\sqrt{x+1}", "√(x + 1)"],
    ["\\sum_{i=1}^n x_i", "∑ᵢ₌₁ⁿ xᵢ"],
    ["\\mathbb{R}^n", "ℝⁿ"],
    ["f(x) \\ne 0", "f(x) ≠ 0"],
    ["\\text{if } x \\ge 0", "if x ≥ 0"],
    ["\\binom{n}{k}", "C(n, k)"],
    ["\\int_0^1 x dx", "∫₀¹ xdx"],
  ]

  for (const [tex, expected] of cases) {
    test(tex, () => {
      expect(renderInlineMath(tex)).toBe(expected)
    })
  }

  test("is always a single line", () => {
    for (const [tex] of cases) {
      expect(renderInlineMath(tex)!.split("\n")).toHaveLength(1)
    }
  })

  test("gives up on unparseable math", () => {
    expect(renderInlineMath("\\frac{")).toBeUndefined()
    expect(renderInlineMath("\\notacommand{x}")).toBeUndefined()
  })
})

describe("display math", () => {
  test("stacks a fraction on a rule", () => {
    expect(renderDisplayMath("f(x) = \\frac{a+1}{b^2}")).toEqual([
      "        a + 1",
      "f(x) = ───────",
      "         b²",
    ])
  })

  test("puts summation limits above and below", () => {
    expect(renderDisplayMath("\\sum_{i=1}^{n} x_i")).toEqual([" n", " ∑  xᵢ", "i=1"])
  })

  test("puts integral limits in the corners", () => {
    expect(renderDisplayMath("\\int_0^\\infty e^{-x}dx")).toEqual([" ∞", "∫  e⁻ˣdx", " 0"])
  })

  test("parenthesises a radicand instead of overlining it", () => {
    expect(renderDisplayMath("\\sqrt{x+1}")).toEqual(["√(x + 1)"])
    expect(renderDisplayMath("\\sqrt{\\pi}")).toEqual(["√π"])
  })

  test("grows parentheses around a multi-row radicand", () => {
    expect(renderDisplayMath("\\sqrt{\\frac{a}{b}}")).toEqual([" ⎛ a ⎞", "√⎜───⎟", " ⎝ b ⎠"])
  })

  test("grows delimiters around a matrix", () => {
    expect(renderDisplayMath("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}")).toEqual(["⎛a  b⎞", "⎝c  d⎠"])
  })

  test("gives up on unparseable math", () => {
    expect(renderDisplayMath("\\frac{")).toBeUndefined()
  })
})

describe("matchDisplayBlock", () => {
  test("matches a standalone block", () => {
    expect(matchDisplayBlock("$$\nE = mc^2\n$$")).toBe("E = mc^2")
    expect(matchDisplayBlock("$$x$$")).toBe("x")
  })

  test("ignores anything else", () => {
    expect(matchDisplayBlock("text $$x$$ more")).toBeUndefined()
    expect(matchDisplayBlock("$x$")).toBeUndefined()
    expect(matchDisplayBlock("$$$$")).toBeUndefined()
  })
})

describe("transformMathSource", () => {
  test("renders inline spans", () => {
    expect(transformMathSource("The energy is $E = mc^2$ today.")).toBe("The energy is E = mc² today.")
    expect(transformMathSource("where \\(x^2\\) holds")).toBe("where x² holds")
  })

  test("leaves currency alone", () => {
    expect(transformMathSource("costs between $5 and $10.")).toBe("costs between $5 and $10.")
    expect(transformMathSource("$100 to $200")).toBe("$100 to $200")
  })

  test("still renders dollar math that looks mathematical", () => {
    expect(transformMathSource("let $n$ be $2^k$")).toBe("let n be 2ᵏ")
  })

  test("leaves inline code spans alone", () => {
    expect(transformMathSource("use `$PATH` and `$x^2$` here")).toBe("use `$PATH` and `$x^2$` here")
  })

  test("leaves fenced code blocks alone", () => {
    const source = ["before $x^2$", "", "```sh", "echo $x^2$", "$$y$$", "```", "", "after"].join("\n")
    expect(transformMathSource(source)).toBe(
      ["before x²", "", "```sh", "echo $x^2$", "$$y$$", "```", "", "after"].join("\n"),
    )
  })

  test("leaves unparseable math untouched", () => {
    expect(transformMathSource("broken $\\frac{ here")).toBe("broken $\\frac{ here")
    expect(transformMathSource("open $$\\frac{a}{b}")).toBe("open $$\\frac{a}{b}")
  })

  test("splits a display block onto its own paragraph", () => {
    const source = "Square the integral:\n$$I^2 = \\int_a^b f(x) dx \\int_a^b f(y) dy$$\nwhich is nice."
    expect(transformMathSource(source)).toBe(
      [
        "Square the integral:",
        "",
        "$$",
        "I^2 = \\int_a^b f(x) dx \\int_a^b f(y) dy",
        "$$",
        "",
        "which is nice.",
      ].join("\n"),
    )
  })

  test("keeps a short display block that continues a sentence in the prose", () => {
    expect(transformMathSource("its value is\n$$\\sqrt{\\pi}.$$\n\nNext.")).toBe("its value is √π.\n\nNext.")
    expect(transformMathSource("We get $$\\frac{a}{b}$$ back.")).toBe("We get a/b back.")
  })

  test("keeps a mid-sentence block that would degrade inline as a display block", () => {
    // Inlining this needs ASCII `^(…)`/`_(…)` scripts, which read worse than the 2D form.
    const source = "The Gaussian integral is\n$$I = \\int_{-\\infty}^{\\infty} e^{-x^2}dx.$$"
    expect(transformMathSource(source)).toBe(
      ["The Gaussian integral is", "", "$$", "I = \\int_{-\\infty}^{\\infty} e^{-x^2}dx.", "$$"].join("\n"),
    )
  })

  test("respects a blank line as a deliberate display block", () => {
    expect(transformMathSource("its value is\n\n$$\\sqrt{\\pi}$$\n\nNext.")).toBe(
      ["its value is", "", "$$", "\\sqrt{\\pi}", "$$", "", "Next."].join("\n"),
    )
  })

  test("still separates a display block that opens a sentence", () => {
    expect(transformMathSource("The identity:\n$$e^{i\\pi} = -1$$\n\nDone.")).toBe(
      ["The identity:", "", "$$", "e^{i\\pi} = -1", "$$", "", "Done."].join("\n"),
    )
  })

  test("normalizes bracket delimiters to dollars", () => {
    expect(transformMathSource("\\[ x = 1 \\]")).toBe(["$$", "x = 1", "$$"].join("\n"))
  })

  test("returns the source unchanged when there is no math", () => {
    const source = "# Heading\n\nJust prose with `code` and a list:\n\n- one\n- two"
    expect(transformMathSource(source)).toBe(source)
  })
})
