import {inc} from "semver";
import {parse as parseSemVer} from "semver";

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
    semver.prerelease.length > 0 ? semver.prerelease.join(".") : null,
    semver.build
  )
}

/**
 * The SemVer class has odd behavior as well as bloats the bundle with unnecessary code.
 * This class preserves the information and provides a consistent toString() method.
 */
export class Version {
  readonly base: string
  readonly prerelease: string | null
  readonly build: readonly string[]

  /** This supports with or without a "v" prefix. */
  constructor(base: string, prerelease: string | null = null, build: readonly string[] = []) {
    this.base = base
    this.prerelease = prerelease
    this.build = build
  }

  get tag(): string {
    return `v${this.base}`
  }

  withPrerelease(prerelease: string | null): Version {
    return new Version(this.base, prerelease, this.build)
  }

  withBuild(build: readonly string[]): Version {
    return new Version(this.base, this.prerelease, build)
  }

  bump(change: VersionIncrement): Version {
    if (change === "none") {
      return this
    }

    const next = inc(this.base, change)
    return new Version(next ?? this.base, this.prerelease, this.build)
  }

  toString(): string {
    const prerelease = this.prerelease ? `-${this.prerelease}` : ""
    const build = this.build.length > 0 ? `+${this.build.join(".")}` : ""
    return `${this.base}${prerelease}${build}`
  }
}
