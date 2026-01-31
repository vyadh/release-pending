import { beforeEach, describe, expect, it } from "vitest"
import type { Context } from "@/context"
import { generateReleaseNotes } from "@/data/release_notes"
import { Octomock } from "../octomock/octomock"

describe("generateReleaseNotes", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()
    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      releaseBranches: ["main"]
    }
  })

  it("should generate release notes with correct parameters", async () => {
    const notes = await generateReleaseNotes(context, "v2.0.0", "main", "v1.0.0")

    expect(octomock.generateReleaseNotes).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      tag_name: "v2.0.0",
      target_commitish: "main",
      previous_tag_name: "v1.0.0"
    })

    expect(notes).toBe("## What's Changed\n\n* Changes from v1.0.0 to v2.0.0\n* Target: main")
  })

  it("should generate release notes without previous_tag_name when previousTagName is null", async () => {
    const notes = await generateReleaseNotes(context, "v2.0.0", "main", null)

    expect(octomock.generateReleaseNotes).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      tag_name: "v2.0.0",
      target_commitish: "main"
    })

    expect(notes).toBe("## What's Changed\n\n* Changes for v2.0.0\n* Target: main")
  })
})
