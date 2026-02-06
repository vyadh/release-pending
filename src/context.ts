import type { Octokit } from "octokit"
import { createOctokit } from "@/octokit-factory"

export interface Context {
  octokit: Octokit
  owner: string
  repo: string
  branch: string
  releaseBranches: string[]
  runNumber: string
  runAttempt: string
}

/**
 * Creates a Context object from environment variables.
 *
 * Extracts GitHub context from standard GitHub Actions environment variables:
 * - GITHUB_TOKEN: Authentication token
 * - GITHUB_REPOSITORY: Repository in "owner/repo" format
 * - GITHUB_REF: Git reference (e.g., "refs/heads/main")
 * - GITHUB_REF_NAME: Fallback for branch/tag name
 * - GITHUB_RUN_NUMBER: Unique number for each workflow run
 * - GITHUB_RUN_ATTEMPT: Unique number for each attempt of a workflow run
 *
 * @param targetBranch - Optional target branch name to override GITHUB_REF / GITHUB_REF_NAME.
 * @param releaseBranches - Optional list of release branch names. If empty, the current branch is used.
 * @throws {Error} If required environment variables are missing or invalid
 */
export function createContext(targetBranch: string = "", releaseBranches: string[] = []): Context {
  const token = getGitHubToken()
  const octokit = createOctokit({ auth: token })
  const { owner, repo } = getRepositoryInfo()
  const branch = getBranch(targetBranch)
  const effectiveReleaseBranches = releaseBranches.length > 0 ? releaseBranches : [branch]
  const runNumber = getRunNumber()
  const runAttempt = getRunAttempt()

  return {
    octokit: octokit,
    owner: owner,
    repo: repo,
    branch: branch,
    releaseBranches: effectiveReleaseBranches,
    runNumber: runNumber,
    runAttempt: runAttempt
  }
}

function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is not set")
  }
  return token
}

function getRepositoryInfo(): { owner: string; repo: string } {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY environment variable is not set")
  }
  const [owner, repo] = repository.split("/")
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY format: ${repository}. Expected format: owner/repo`)
  }
  return { owner: owner, repo: repo }
}

function getBranch(targetBranch: string): string {
  // Use target branch if provided
  if (targetBranch) {
    return targetBranch
  }

  // GITHUB_REF format: refs/heads/branch-name or refs/tags/tag-name
  const ref = process.env.GITHUB_REF
  if (!ref) {
    throw new Error("GITHUB_REF environment variable is not set")
  }

  // Extract branch name from refs/heads/branch-name
  if (ref.startsWith("refs/heads/")) {
    return ref.replace("refs/heads/", "")
  }

  // For tags or other refs, fall back to GITHUB_REF_NAME if available
  const refName = process.env.GITHUB_REF_NAME
  if (refName) {
    return refName
  }

  throw new Error(`Unable to determine branch from GITHUB_REF: ${ref}`)
}

function getRunNumber(): string {
  const runNumber = process.env.GITHUB_RUN_NUMBER
  if (!runNumber) {
    throw new Error("GITHUB_RUN_NUMBER environment variable is not set")
  }
  return runNumber
}

function getRunAttempt(): string {
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT
  if (!runAttempt) {
    throw new Error("GITHUB_RUN_ATTEMPT environment variable is not set")
  }
  return runAttempt
}
