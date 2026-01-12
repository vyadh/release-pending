import { Octokit } from "octokit"

export interface Context {
  octokit: Octokit
  owner: string
  repo: string
  branch: string
}
