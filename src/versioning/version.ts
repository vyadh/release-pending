import inc from "semver/functions/inc.js"
import parse from "semver/functions/parse.js"

/** Which part of the version to increment, or "none" to leave unchanged. */
export type VersionIncrement = VersionComponent | "none"

/** The part of the version to increment as understood by `semver` library. */
export type VersionComponent = "major" | "minor" | "patch"

export function parseVersion(versionString: string): Version {
  const semver = parse(versionString, { loose: false })
  if (semver === null) {
    throw new Error(`Invalid version: ${versionString}`)
  }
  return new Version(
    `${semver.major}.${semver.minor}.${semver.patch}`,
    semver.prerelease.map((part: number | string) => part.toString()),
    semver.build
  )
}

/**
 * Using branch names for prerelease metadata, with path separators converted to prerelease separators (.),
 * and any other unsupported character replaced with hyphens (-) and de-duplicated.
 */
export function sanitiseBranchPrerelease(branch: string): string[] {
  const sanitised = branch
    // Truncate to avoid excessively long prerelease metadata
    .substring(0, 50)
    // Replace branch paths with periods
    .replace(/\//g, ".")
    // Replace unsupported characters with hyphens
    .replace(/[^0-9A-Za-z.-]+/g, "-")
    // De-duplicate dots and hyphens
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")

  const parts = sanitised
    // Split into an array, which is how pre-release metadata is represented
    .split(".")
    // Remove leading zeros (standard semver requirement)
    .map((part) => part.replace(/^0+(\d+)/, "$1"))
    // Remove any remaining leading and trailing hyphen (already de-duplicated)
    .map((part) => part.replace(/^-/, ""))
    .map((part) => part.replace(/-$/, ""))
    // Remove empty parts, which includes all characters removed in previous stages
    .filter((part) => part.length > 0)
    // Limit to 10 parts to avoid excessively long prerelease metadata
    .slice(0, 10)

  // Prefix with `branch` to respect semver precedence rules
  return parts.length === 0 ? ["branch"] : ["branch", ...parts]
}

/**
 * The SemVer class has odd behavior as well as bloats the bundle with unnecessary code.
 * This class preserves the information and provides a consistent toString() method.
 */
export class Version {
  readonly core: string
  readonly prerelease: readonly string[]
  readonly build: readonly string[]

  /** This supports with or without a "v" prefix. */
  constructor(core: string, prerelease: readonly string[] = [], build: readonly string[] = []) {
    this.core = core
    this.prerelease = prerelease
    this.build = build
  }

  get tag(): string {
    return `v${this.core}`
  }

  withPrerelease(prerelease: string[]): Version {
    return new Version(this.core, prerelease, this.build)
  }

  withBuild(build: readonly string[]): Version {
    return new Version(this.core, this.prerelease, build)
  }

  /**
   * Note this only bumps the core version, it has no effect on prerelease or build metadata.
   * The `node-semver` package implements subtle rules here, which are not part of the SemVer spec,
   * such as not bumping a prerelease on a `patch`, but bumping on `minor`.
   * For now, we'll keep it simple and intuitive by always bumping the core version.
   */
  bump(change: VersionIncrement): Version {
    if (change === "none") {
      return this
    }

    const next = inc(this.core, change)
    if (next === null) {
      // Since the version is validated in parse(), this shouldn't happen
      throw new Error(`Unable to bump version '${this.core}' with change '${change}'`)
    }
    return new Version(next, this.prerelease, this.build)
  }

  toString(): string {
    const prerelease = this.prerelease.length > 0 ? `-${this.prerelease.join(".")}` : ""
    const build = this.build.length > 0 ? `+${this.build.join(".")}` : ""
    return `${this.core}${prerelease}${build}`
  }
}
