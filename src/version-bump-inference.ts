import { PullRequest } from "./pull-requests"
import { VersionIncrement } from "./versions"
import { messageImpact, maxImpact } from "./conventional-commits"

/**
 * Infers the maximum version impact from a set of pull requests.
 */
export function inferImpactFromPRs(prs: PullRequest[]): VersionIncrement {
  return maxImpact(prs.map(inferVersionImpactFromPR))
}

function inferVersionImpactFromPR(pr: PullRequest): VersionIncrement {
  return messageImpact(pr.title)
}
