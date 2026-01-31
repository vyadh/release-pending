import { beforeEach, describe, expect, it, vi } from "vitest"
import * as core from "@/actions-core/core"

vi.mock("@/context", () => ({
  createContext: vi.fn().mockReturnValue({
    octokit: {},
    owner: "test-owner",
    repo: "test-repo",
    branch: "main",
    releaseBranches: ["main"]
  })
}))

// Mock the core module before importing main
vi.mock("@/core", () => ({
  performAction: vi.fn()
}))

import * as contextModule from "@/context"
import * as coreModule from "@/core"
import { main } from "@/main"

describe("main", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mock return value
    vi.mocked(coreModule.performAction).mockResolvedValue({
      action: "created",
      lastDraft: null,
      lastRelease: {
        id: 122,
        name: "v1.0.0",
        tagName: "v1.0.0",
        body: "Release notes",
        draft: false,
        prerelease: false,
        targetCommitish: "main",
        publishedAt: null
      },
      release: {
        id: 123,
        name: "v1.1.0",
        tagName: "v1.1.0",
        body: "Release notes",
        draft: true,
        prerelease: false,
        targetCommitish: "main",
        publishedAt: null
      },
      version: "v1.1.0",
      pullRequestTitles: [
        "feat: feature 1",
        "feat: feature 2",
        "fix: bug fix",
        "feat: feature 3",
        "fix: another bug"
      ],
      versionIncrement: "minor"
    })
  })

  it("reads default-tag input and calls upsertDraftRelease", async () => {
    const getInput = vi.spyOn(core, "getInput").mockReturnValue("v0.1.0")
    vi.spyOn(core, "info").mockImplementation(() => {})
    const setOutput = vi.spyOn(core, "setOutput").mockImplementation(() => {})

    await main()

    expect(getInput).toHaveBeenCalledWith("default-tag")
    expect(contextModule.createContext).toHaveBeenCalled()
    expect(coreModule.performAction).toHaveBeenCalledWith(
      {
        branch: "main",
        octokit: {},
        owner: "test-owner",
        repo: "test-repo",
        releaseBranches: ["main"]
      },
      "v0.1.0"
    )
    expect(setOutput).toHaveBeenCalledWith("action", "created")
    expect(setOutput).toHaveBeenCalledWith("last-version", "v1.0.0")
    expect(setOutput).toHaveBeenCalledWith("next-version", "v1.1.0")
    expect(setOutput).toHaveBeenCalledWith("release-id", 123)
  })

  it("calls setFailed when an exception is thrown", async () => {
    vi.spyOn(core, "getInput").mockImplementation(() => {
      throw new Error("boom")
    })
    const setFailed = vi.spyOn(core, "setFailed").mockImplementation(() => {})

    await main()

    expect(setFailed).toHaveBeenCalledWith("boom")
  })

  it("calls setFailed when createContext throws an error", async () => {
    vi.mocked(contextModule.createContext).mockImplementationOnce(() => {
      throw new Error("GITHUB_TOKEN environment variable is not set")
    })
    vi.spyOn(core, "getInput").mockReturnValue("v0.1.0")
    const setFailed = vi.spyOn(core, "setFailed").mockImplementation(() => {})

    await main()

    expect(setFailed).toHaveBeenCalledWith("GITHUB_TOKEN environment variable is not set")
  })

  it("outputs all result information", async () => {
    vi.spyOn(core, "getInput").mockReturnValue("v0.1.0")
    const info = vi.spyOn(core, "info").mockImplementation(() => {})
    vi.spyOn(core, "setOutput").mockImplementation(() => {})

    await main()

    expect(info).toHaveBeenCalledWith("Action Taken: created")
    expect(info).toHaveBeenCalledWith("Last Release: v1.0.0")
    expect(info).toHaveBeenCalledWith("Current Draft: (none)")
    expect(info).toHaveBeenCalledWith("Version Increment: minor")
    expect(info).toHaveBeenCalledWith("Next Version: v1.1.0")
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Updated Draft: v1.1.0"))
    expect(core.setOutput).toHaveBeenCalledWith("last-version", "v1.0.0")
    expect(core.setOutput).toHaveBeenCalledWith("next-version", "v1.1.0")
    expect(core.setOutput).toHaveBeenCalledWith("release-id", 123)
  })

  it("does not output release-id when no release is present", async () => {
    vi.mocked(coreModule.performAction).mockResolvedValueOnce({
      action: "none",
      lastDraft: null,
      lastRelease: null
    })
    vi.spyOn(core, "getInput").mockReturnValue("v0.1.0")
    vi.spyOn(core, "info").mockImplementation(() => {})
    const setOutput = vi.spyOn(core, "setOutput").mockImplementation(() => {})

    await main()

    expect(setOutput).toHaveBeenCalledWith("action", "none")
    expect(setOutput).not.toHaveBeenCalledWith("release-id", expect.anything())
    expect(setOutput).not.toHaveBeenCalledWith("version", expect.anything())
  })

  it("outputs message when action is none", async () => {
    vi.mocked(coreModule.performAction).mockResolvedValue({
      action: "none",
      lastDraft: null,
      lastRelease: null
    })
    vi.spyOn(core, "getInput").mockReturnValue("v0.1.0")
    const info = vi.spyOn(core, "info").mockImplementation(() => {})
    vi.spyOn(core, "setOutput").mockImplementation(() => {})

    await main()

    expect(info).toHaveBeenCalledWith("\nRelease branch: Full release management")
    expect(info).toHaveBeenCalledWith(
      "No outstanding PRs found, so a draft release was neither created nor updated"
    )
  })

  it("outputs version inference results for feature branch", async () => {
    vi.mocked(coreModule.performAction).mockResolvedValue({
      action: "version",
      lastRelease: {
        id: 122,
        name: "v1.0.0",
        tagName: "v1.0.0",
        body: "Release notes",
        draft: false,
        prerelease: false,
        targetCommitish: "main",
        publishedAt: null
      },
      pullRequestTitles: ["feat: new feature"],
      versionIncrement: "minor",
      version: "v1.1.0"
    })
    vi.spyOn(core, "getInput").mockReturnValue("v0.1.0")
    vi.spyOn(core, "getMultilineInput").mockReturnValue(["main"])
    const info = vi.spyOn(core, "info").mockImplementation(() => {})
    const setOutput = vi.spyOn(core, "setOutput").mockImplementation(() => {})

    await main()

    expect(info).toHaveBeenCalledWith("\nFeature branch: Version inference only")
    expect(info).toHaveBeenCalledWith("Action Taken: version")
    expect(info).toHaveBeenCalledWith("Last Release: v1.0.0")
    expect(info).toHaveBeenCalledWith("Version Increment: minor")
    expect(info).toHaveBeenCalledWith("Next Version: v1.1.0")

    expect(setOutput).toHaveBeenCalledWith("action", "version")
    expect(setOutput).toHaveBeenCalledWith("last-version", "v1.0.0")
    expect(setOutput).toHaveBeenCalledWith("next-version", "v1.1.0")
    expect(setOutput).not.toHaveBeenCalledWith("release-id", expect.anything())
  })

  it("does not output release-id for feature branch version action", async () => {
    vi.mocked(coreModule.performAction).mockResolvedValue({
      action: "version",
      lastRelease: null,
      pullRequestTitles: ["feat: new feature"],
      versionIncrement: "minor",
      version: "v0.1.0"
    })
    vi.spyOn(core, "getInput").mockReturnValue("v0.1.0")
    vi.spyOn(core, "getMultilineInput").mockReturnValue(["main"])
    vi.spyOn(core, "info").mockImplementation(() => {})
    const setOutput = vi.spyOn(core, "setOutput").mockImplementation(() => {})

    await main()

    expect(setOutput).toHaveBeenCalledWith("action", "version")
    expect(setOutput).toHaveBeenCalledWith("next-version", "v0.1.0")
    expect(setOutput).not.toHaveBeenCalledWith("release-id", expect.anything())
    expect(setOutput).not.toHaveBeenCalledWith("last-version", expect.anything())
  })
})
