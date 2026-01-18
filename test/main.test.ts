import { beforeEach, describe, expect, it, vi } from "vitest"
import * as core from "../src/actions-core/core"
import { main } from "../src/main"

describe("main", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("reads question input and sets output", async () => {
    const getInput = vi.spyOn(core, "getInput").mockReturnValue("What is the answer?")
    const info = vi.spyOn(core, "info").mockImplementation(() => {})
    const setOutput = vi.spyOn(core, "setOutput").mockImplementation(() => {})

    await main()

    expect(getInput).toHaveBeenCalledWith("question")
    expect(info).toHaveBeenCalledWith("The question is: What is the answer?")
    expect(setOutput).toHaveBeenCalledWith("answer", 42)
  })

  it("calls setFailed when an exception is thrown", async () => {
    vi.spyOn(core, "getInput").mockImplementation(() => {
      throw new Error("boom")
    })
    const setFailed = vi.spyOn(core, "setFailed").mockImplementation(() => {})

    await main()

    expect(setFailed).toHaveBeenCalledWith("boom")
  })
})
