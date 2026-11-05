import { describe, expect, test } from "bun:test"
import { transformMathSource } from "../../src/util/math"

const fenced = (tex: string) => ["```math", tex, "```"]

describe("transformMathSource", () => {
  test("renders single-line inline spans", () => {
    expect(transformMathSource("The energy is $E = mc^2$ today.")).toBe("The energy is E = mc² today.")
    expect(transformMathSource("where \\(x^2\\) holds")).toBe("where x² holds")
    expect(transformMathSource("let $n$ be $2^n$")).toBe("let n be 2ⁿ")
  })

  test.each([
    ["x^k", "xᵏ"],
    ["e^{i\\pi}+1=0", "e^(iπ) + 1 = 0"],
    ["x_{i+1}^{2n}", "xᵢ₊₁²ⁿ"],
    ["a_b^c", "a_b^c"],
    ["\\frac{a+1}{b^2}", "(a+1)/b²"],
    ["\\frac{1}{2}mv^2", "1/2mv²"],
    ["\\sqrt{a+b}", "√(a+b)"],
    ["\\sqrt[3]{x}", "∛x"],
    ["\\vec{v} + \\hat{x}", "v⃗ + x̂"],
    ["\\sum_{i=1}^n i", "∑ᵢ₌₁ⁿ i"],
    ["\\mathbb{R}^n", "ℝⁿ"],
  ])("prints $%s$ on one line", (tex, expected) => {
    expect(transformMathSource(`$${tex}$`)).toBe(expected)
  })

  test("keeps the source of inline math with no one-line form", () => {
    const source = "the matrix $\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$ here"
    expect(transformMathSource(source)).toBe(source)
  })

  test("leaves currency alone", () => {
    expect(transformMathSource("costs between $5 and $10.")).toBe("costs between $5 and $10.")
    expect(transformMathSource("$100 to $200")).toBe("$100 to $200")
  })

  test("leaves code spans and fenced code blocks alone", () => {
    expect(transformMathSource("use `$PATH` and `$x^2$` here")).toBe("use `$PATH` and `$x^2$` here")
    const source = ["before $x^2$", "", "```sh", "echo $x^2$", "$$y$$", "```", "", "after"].join("\n")
    expect(transformMathSource(source)).toBe(
      ["before x²", "", "```sh", "echo $x^2$", "$$y$$", "```", "", "after"].join("\n"),
    )
  })

  test("leaves unparseable math untouched", () => {
    expect(transformMathSource("broken $\\frac{ here")).toBe("broken $\\frac{ here")
    expect(transformMathSource("open $$\\frac{a}{b}")).toBe("open $$\\frac{a}{b}")
    expect(transformMathSource("$$\\nosuchcommand{x}$$")).toBe("$$\\nosuchcommand{x}$$")
  })

  test("turns a display block into a fenced math block on its own paragraph", () => {
    const source = "Square the integral:\n$$I^2 = \\int_a^b f(x) dx \\int_a^b f(y) dy$$\nwhich is nice."
    expect(transformMathSource(source)).toBe(
      [
        "Square the integral:",
        "",
        ...fenced("I^2 = \\int_a^b f(x) dx \\int_a^b f(y) dy"),
        "",
        "which is nice.",
      ].join("\n"),
    )
    expect(transformMathSource("\\[ x = \\frac{1}{2} \\]")).toBe(fenced("x = \\frac{1}{2}").join("\n"))
  })

  test("splices a short display block that continues a sentence, unless it needs ASCII scripts", () => {
    expect(transformMathSource("its value is\n$$x^2.$$\n\nNext.")).toBe("its value is x².\n\nNext.")
    expect(transformMathSource("We get $$\\frac{a}{b}$$ back.")).toBe("We get a/b back.")
    expect(transformMathSource("We get $$a_b^c$$ back.")).toBe(
      ["We get", "", ...fenced("a_b^c"), "", " back."].join("\n"),
    )
  })

  test("respects a blank line as a deliberate display block", () => {
    expect(transformMathSource("its value is\n\n$$x^2$$\n\nNext.")).toBe(
      ["its value is", "", ...fenced("x^2"), "", "Next."].join("\n"),
    )
  })

  test("returns the source unchanged when there is no math", () => {
    const source = "# Heading\n\nJust prose with `code` and a list:\n\n- one\n- two"
    expect(transformMathSource(source)).toBe(source)
  })
})
