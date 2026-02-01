import { describe, expect, it } from "vitest"
import type { PullRequest } from "@/data/pull-requests"
import { inferImpactFromPRs } from "@/versioning/version-bump-inference"

function createPR(number: number, title: string): PullRequest {
  return {
    title: title,
    number: number,
    baseRefName: "main",
    state: "MERGED",
    mergedAt: new Date()
  }
}

describe("inferImpactFromPRs", () => {
  it("should return none for empty PR array", () => {
    const impact = inferImpactFromPRs([])
    expect(impact).toBe("none")
  })

  it("should infer impact from single PR", () => {
    const prs = [createPR(1, "feat: new feature")]
    const impact = inferImpactFromPRs(prs)
    expect(impact).toBe("minor")
  })

  it("should infer patch from single fix PR", () => {
    const prs = [createPR(1, "fix: correct bug")]
    const impact = inferImpactFromPRs(prs)
    expect(impact).toBe("patch")
  })

  it("should infer minor from single feat PR", () => {
    const prs = [createPR(1, "feat: add new feature")]
    const impact = inferImpactFromPRs(prs)
    expect(impact).toBe("minor")
  })

  it("should infer major from single breaking change PR", () => {
    const prs = [createPR(1, "feat!: breaking change")]
    const impact = inferImpactFromPRs(prs)
    expect(impact).toBe("major")
  })

  it("should return maximum impact from multiple PRs", () => {
    const prs = [
      createPR(1, "fix: bug fix"),
      createPR(2, "feat: new feature"),
      createPR(3, "chore: update deps")
    ]
    const impact = inferImpactFromPRs(prs)
    expect(impact).toBe("minor")
  })

  it("should prioritize major over other impacts", () => {
    const prs = [
      createPR(1, "fix: bug fix"),
      createPR(2, "feat!: breaking change"),
      createPR(3, "feat: new feature")
    ]
    const impact = inferImpactFromPRs(prs)
    expect(impact).toBe("major")
  })
})
