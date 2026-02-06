import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createContext } from "@/context"

vi.mock("@/octokit-factory", () => ({
  createOctokit: vi.fn().mockReturnValue({ mockOctokit: true })
}))

import * as octokitFactory from "@/octokit-factory"

describe("createContext", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.GITHUB_TOKEN = "test-token"
    process.env.GITHUB_REPOSITORY = "test-owner/test-repo"
    process.env.GITHUB_REF = "refs/heads/main"
    process.env.GITHUB_RUN_NUMBER = "1"
    process.env.GITHUB_RUN_ATTEMPT = "1"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("creates context with valid environment variables", () => {
    const context = createContext()

    expect(context).toEqual({
      octokit: { mockOctokit: true },
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      releaseBranches: ["main"],
      runNumber: "1",
      runAttempt: "1"
    })
    expect(octokitFactory.createOctokit).toHaveBeenCalledWith({ auth: "test-token" })
  })

  it("override ref targetBranch", () => {
    process.env.GITHUB_REF = "refs/heads/main"

    const context = createContext("release")

    expect(context.branch).toBe("release")
  })

  it("extracts branch from refs/heads/ format", () => {
    process.env.GITHUB_REF = "refs/heads/feature/my-feature"

    const context = createContext()

    expect(context.branch).toBe("feature/my-feature")
  })

  it("uses GITHUB_REF_NAME as fallback for tags", () => {
    process.env.GITHUB_REF = "refs/tags/v1.1.1" // not refs/heads/*
    process.env.GITHUB_REF_NAME = "v1.0.0"

    const context = createContext()

    expect(context.branch).toBe("v1.0.0")
  })

  it("throws error when GITHUB_TOKEN is not set", () => {
    delete process.env.GITHUB_TOKEN

    expect(() => createContext()).toThrow("GITHUB_TOKEN environment variable is not set")
  })

  it("throws error when GITHUB_REPOSITORY is not set", () => {
    delete process.env.GITHUB_REPOSITORY

    expect(() => createContext()).toThrow("GITHUB_REPOSITORY environment variable is not set")
  })

  it("throws error when GITHUB_REPOSITORY has invalid format", () => {
    process.env.GITHUB_REPOSITORY = "invalid-format"

    expect(() => createContext()).toThrow(
      "Invalid GITHUB_REPOSITORY format: invalid-format. Expected format: owner/repo"
    )
  })

  it("throws error when GITHUB_REPOSITORY is missing owner", () => {
    process.env.GITHUB_REPOSITORY = "/repo"

    expect(() => createContext()).toThrow(
      "Invalid GITHUB_REPOSITORY format: /repo. Expected format: owner/repo"
    )
  })

  it("throws error when GITHUB_REPOSITORY is missing repo", () => {
    process.env.GITHUB_REPOSITORY = "owner/"

    expect(() => createContext()).toThrow(
      "Invalid GITHUB_REPOSITORY format: owner/. Expected format: owner/repo"
    )
  })

  it("throws error when GITHUB_REF is not set", () => {
    delete process.env.GITHUB_REF

    expect(() => createContext()).toThrow("GITHUB_REF environment variable is not set")
  })

  it("throws error when GITHUB_REF is not refs/heads and GITHUB_REF_NAME is not set", () => {
    process.env.GITHUB_REF = "refs/pull/123/merge"
    delete process.env.GITHUB_REF_NAME

    expect(() => createContext()).toThrow("Unable to determine branch from GITHUB_REF: refs/pull/123/merge")
  })

  it("handles complex repository names", () => {
    process.env.GITHUB_REPOSITORY = "my-org/my-complex-repo-name"

    const context = createContext()

    expect(context.owner).toBe("my-org")
    expect(context.repo).toBe("my-complex-repo-name")
  })

  it("handles branch names with special characters", () => {
    process.env.GITHUB_REF = "refs/heads/feature/ABC-123_my-feature"

    const context = createContext()

    expect(context.branch).toBe("feature/ABC-123_my-feature")
  })

  it("uses provided releaseBranches when specified", () => {
    const context = createContext("", ["main", "develop"])

    expect(context.releaseBranches).toEqual(["main", "develop"])
  })

  it("uses current branch as releaseBranches when empty array provided", () => {
    const context = createContext("", [])

    expect(context.releaseBranches).toEqual(["main"])
  })

  it("uses current branch as releaseBranches when no parameter provided", () => {
    const context = createContext()

    expect(context.releaseBranches).toEqual(["main"])
  })

  it("reads runNumber from environment variable", () => {
    process.env.GITHUB_RUN_NUMBER = "42"

    const context = createContext()

    expect(context.runNumber).toBe("42")
  })

  it("reads runAttempt from environment variable", () => {
    process.env.GITHUB_RUN_ATTEMPT = "3"

    const context = createContext()

    expect(context.runAttempt).toBe("3")
  })

  it("reads both runNumber and runAttempt when set", () => {
    process.env.GITHUB_RUN_NUMBER = "123"
    process.env.GITHUB_RUN_ATTEMPT = "2"

    const context = createContext()

    expect(context.runNumber).toBe("123")
    expect(context.runAttempt).toBe("2")
  })

  it("throws error when GITHUB_RUN_NUMBER is not set", () => {
    delete process.env.GITHUB_RUN_NUMBER

    expect(() => createContext()).toThrow("GITHUB_RUN_NUMBER environment variable is not set")
  })

  it("throws error when GITHUB_RUN_ATTEMPT is not set", () => {
    process.env.GITHUB_RUN_NUMBER = "1"
    delete process.env.GITHUB_RUN_ATTEMPT

    expect(() => createContext()).toThrow("GITHUB_RUN_ATTEMPT environment variable is not set")
  })
})
