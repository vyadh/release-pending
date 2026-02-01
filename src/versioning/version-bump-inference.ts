import type { PullRequest } from "@/data/pull-requests"
import { maxImpact, messageImpact } from "@/versioning/conventional-commits"
import type { VersionIncrement } from "@/versioning/version"

/**
 * Infers the maximum version impact from a set of pull requests.
 */
export function inferImpactFromPRs(prs: PullRequest[]): VersionIncrement {
  return maxImpact(prs.map(inferVersionImpactFromPR))
}

function inferVersionImpactFromPR(pr: PullRequest): VersionIncrement {
  return messageImpact(pr.title)
}
