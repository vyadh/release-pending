import {SemVer} from "semver";

/** Which part of the version to increment, or "none" to leave unchanged. */
export type VersionIncrement = VersionComponent | "none"

/** The part of the version to increment as understood by `semver` library. */
export type VersionComponent = "major" | "minor" | "patch"

export function parse(version: string): Version {
  return new Version(new SemVer(version, {loose: false}))
}

/**
 * The SemVer class has odd behavior. This class preserves
 * the information and provides a consistent toString() method.
 */
export class Version {
  private readonly semver: SemVer

  /** This supports with or without a "v" prefix. */
  constructor(semver: SemVer) {
    this.semver = semver
  }

  get base(): string {
    return `${this.semver.major}.${this.semver.minor}.${this.semver.patch}`
  }

  get tag(): string {
    return `v${this.base}`
  }

  get prerelease(): string | null {
    return this.semver.prerelease.length === 0 ? null : String(this.semver.prerelease[0])
  }

  set prerelease(components: string) {
    this.semver.prerelease = [components]
  }

  get build(): readonly string[] {
    return this.semver.build
  }

  set build(components: readonly string[]) {
    this.semver.build = components
  }

  bump(change: VersionIncrement): Version {
    if (change === "none") {
      return this
    }

    const next = this.copy()
    next.semver.inc(change)
    return next
  }

  copy(): Version {
    const result = new SemVer(this.semver.version, {loose: false})
    return new Version(result)
  }

  toString(): string {
    if (this.semver.build.length > 0) {
      const build = this.semver.build.join(".")
      return `${this.semver.format()}+${build}`
    } else {
      return this.semver.format()
    }
  }
}
