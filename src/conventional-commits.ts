import { VersionIncrement } from "./versions"

/**
 * Parses a conventional commit message and reads its impact level.
 *
 * Handles the conventional commit format: type(scope): description
 * - Breaking changes (BREAKING CHANGE: or !) result in MAJOR impact
 * - feat results in MINOR impact
 * - fix results in PATCH impact
 * - Other types or invalid format result in NONE impact
 */
export function messageImpact(message: string): VersionIncrement {
  if (!message || message.trim() === "") {
    return "none"
  }

  if (message.includes("BREAKING CHANGE:") || message.includes("BREAKING-CHANGE:")) {
    return "major"
  }

  const firstLine = message.split("\n")[0].trim()

  // Match conventional commit format: type(scope)!: description or type!: description
  // Also handle without scope: type: description
  // Scope can be empty: type(): description
  const conventionalCommitRegex = /^([a-z]+)(\([^)]*\))?(!)?:\s*\S+/
  const match = firstLine.match(conventionalCommitRegex)

  if (!match) {
    return "none"
  }

  const type = match[1]
  const hasBreakingMarker = match[3] === "!"

  if (hasBreakingMarker) {
    return "major"
  } else if (type === "feat") {
    return "minor"
  } else if (type === "fix") {
    return "patch"
  } else {
    return "none"
  }
}

/**
 * Processes an array of commit message impacts and returns the maximum impact level.
 *
 * The maximum impact follows the hierarchy: MAJOR > MINOR > PATCH > NONE
 *
 * @param impacts - Array of commit impacts to analyze
 * @returns The maximum impact level found across all impacts
 */
export function maxImpact(impacts: VersionIncrement[]): VersionIncrement {
  if (!impacts || impacts.length === 0) {
    return "none"
  }

  let currentMax: VersionIncrement = "none"

  for (const impact of impacts) {
    if (impact === "major") {
      return "major"
    }

    if (impact === "minor" && (currentMax === "none" || currentMax === "patch")) {
      currentMax = "minor"
    } else if (impact === "patch" && currentMax === "none") {
      currentMax = "patch"
    }
  }

  return currentMax
}
