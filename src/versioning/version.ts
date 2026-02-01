import { inc, parse as parseSemVer } from "semver"

/** Which part of the version to increment, or "none" to leave unchanged. */
export type VersionIncrement = VersionComponent | "none"

/** The part of the version to increment as understood by `semver` library. */
export type VersionComponent = "major" | "minor" | "patch"

export function parse(versionString: string): Version {
  const semver = parseSemVer(versionString, { loose: false })
  if (semver === null) {
    throw new Error(`Invalid version: ${versionString}`)
  }
  return new Version(
    `${semver.major}.${semver.minor}.${semver.patch}`,
    semver.prerelease.map((part) => part.toString()),
    semver.build
  )
}

/**
 * The SemVer class has odd behavior as well as bloats the bundle with unnecessary code.
 * This class preserves the information and provides a consistent toString() method.
 */
export class Version {
  readonly base: string
  readonly prerelease: readonly string[]
  readonly build: readonly string[]

  /** This supports with or without a "v" prefix. */
  constructor(base: string, prerelease: readonly string[] = [], build: readonly string[] = []) {
    this.base = base
    this.prerelease = prerelease
    this.build = build
  }

  get tag(): string {
    return `v${this.base}`
  }

  withPrerelease(prerelease: string[]): Version {
    return new Version(this.base, prerelease, this.build)
  }

  withBuild(build: readonly string[]): Version {
    return new Version(this.base, this.prerelease, build)
  }

  /**
   * Note this only bumps the base version, it has no effect on prerelease or build metadata.
   * The `node-semver` package implements subtle rules here, which are not part of the SemVer spec,
   * such as not bumping a prerelease on a `patch`, but bumping on `minor`.
   * For now, we'll keep it simple and intuitive by always bumping the base version.
   */
  bump(change: VersionIncrement): Version {
    if (change === "none") {
      return this
    }

    const next = inc(this.base, change)
    if (next === null) {
      // Since the version is validated in parse(), this shouldn't happen
      throw new Error(`Unable to bump version '${this.base}' with change '${change}'`)
    }
    return new Version(next, this.prerelease, this.build)
  }

  toString(): string {
    const prerelease = this.prerelease.length > 0 ? `-${this.prerelease.join(".")}` : ""
    const build = this.build.length > 0 ? `+${this.build.join(".")}` : ""
    return `${this.base}${prerelease}${build}`
  }
}
