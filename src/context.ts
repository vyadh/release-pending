import type { Octokit } from "octokit"
import { createOctokit } from "@/octokit-factory"

export interface Context {
  octokit: Octokit
  owner: string
  repo: string
  branch: string
}

/**
 * Creates a Context object from environment variables.
 *
 * Extracts GitHub context from standard GitHub Actions environment variables:
 * - GITHUB_TOKEN: Authentication token
 * - GITHUB_REPOSITORY: Repository in "owner/repo" format
 * - GITHUB_REF: Git reference (e.g., "refs/heads/main")
 * - GITHUB_REF_NAME: Fallback for branch/tag name
 *
 * @throws {Error} If required environment variables are missing or invalid
 */
export function createContext(): Context {
  const token = getGitHubToken()
  const octokit = createOctokit({ auth: token })
  const { owner, repo } = getRepositoryInfo()
  const branch = getBranch()

  return { octokit, owner, repo, branch }
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
  return { owner, repo }
}

function getBranch(): string {
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
