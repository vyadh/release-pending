import inc from "semver/functions/inc.js"

/** Which part of the version to increment, or "none" to leave unchanged. */
export type VersionIncrement = VersionComponent | "none"

/** The part of the version to increment as understood by `semver` library. */
export type VersionComponent = "major" | "minor" | "patch"

/**
 * Bump the given version tag according to the specified change.
 *
 * @param versionTag The semantic version tag to bump (for example, "v1.2.3").
 * @param change The type of version increment to apply, or "none" to return the original version unchanged.
 * @param defaultTag The default version tag to use if {@link versionTag} is null or undefined.
 * @returns The bumped version tag, or the original version if {@link VersionIncrement} is "none".
 * @throws Error If the version part is invalid or cannot be parsed or bumped by the underlying `semver` library.
 */
export function bumpTag(
  versionTag: string | null | undefined,
  change: VersionIncrement,
  defaultTag: string
): string {
  if (!versionTag) {
    return checkedVersionTag(defaultTag)
  }
  const bare = checkedVersionTag(versionTag).slice(1)
  const bumped = bump(bare, change)
  return `v${bumped}`
}

function checkedVersionTag(versionTag: string) {
  if (!versionTag.startsWith("v")) {
    throw new Error(`Invalid version tag: ${versionTag}`)
  }
  return versionTag
}

/**
 * Bump the given semantic version according to the specified change.
 *
 * @param version The semantic version string to bump (for example, "1.2.3").
 * @param change The type of version increment to apply, or "none" to return the original version unchanged.
 * @returns The bumped version string, or the original version if {@link VersionIncrement} is "none".
 * @throws Error If the version string is invalid or cannot be parsed or bumped by the underlying `semver` library.
 */
export function bump(version: string, change: VersionIncrement): string {
  if (change === "none") {
    return version
  }

  const next = inc(version, change)
  if (!next) {
    throw new Error(`Invalid version or cannot bump: ${version}`)
  }

  return next
}
