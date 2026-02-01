import { describe, expect, it } from "vitest"
import { parseVersion } from "@/versioning/version"

describe("basic version parsing", () => {
  it("should parse version with v prefix", () => {
    expect(parseVersion("v1.2.3").toString()).toBe("1.2.3")
  })

  it("should parse standard version", () => {
    const version = parseVersion("2.3.4")

    expect(version.toString()).toBe("2.3.4")
    expect(version.base).toBe("2.3.4")
    expect(version.build).toStrictEqual([])
    expect(version.prerelease).toStrictEqual([])
  })

  it("should parse full version", () => {
    const version = parseVersion("2.3.4-alpha.1+build.number")

    expect(version.toString()).toBe("2.3.4-alpha.1+build.number")
    expect(version.base).toBe("2.3.4")
    expect(version.prerelease).toStrictEqual(["alpha", "1"])
    expect(version.build).toStrictEqual(["build", "number"])
  })

  it("should error on invalid version", () => {
    expect(() => parseVersion("")).toThrow("Invalid version: ")
    expect(() => parseVersion("1.b.3")).toThrow("Invalid version: 1.b.3")
    expect(() => parseVersion("1.2.3.4")).toThrow("Invalid version: 1.2.3.4")
  })
})

describe("prereleases", () => {
  it("should format version with prerelease", () => {
    const version = parseVersion("1.0.0").withPrerelease(["pre", "2"])

    expect(version.prerelease).toStrictEqual(["pre", "2"])
    expect(version.toString()).toBe("1.0.0-pre.2")
  })
})

describe("builds", () => {
  it("should format version with build", () => {
    const version = parseVersion("1.0.0").withBuild(["a", "b", "c"])
    expect(version.toString()).toBe("1.0.0+a.b.c")
  })
})

describe("combined prerelease and build", () => {
  it("should format version with prerelease and build", () => {
    const version = parseVersion("2.1.1").withPrerelease(["beta"]).withBuild(["a", "b", "c"])

    expect(version.toString()).toBe("2.1.1-beta+a.b.c")
  })
})

describe("tag version", () => {
  it("should return the version tag with v prefix", () => {
    expect(parseVersion("1.2.3").tag).toBe("v1.2.3")
    expect(parseVersion("v2.3.4").tag).toBe("v2.3.4")
  })
  it("should return no metadata", () => {
    expect(parseVersion("1.2.3-alpha+build").tag).toBe("v1.2.3")
  })
})

describe("bump", () => {
  it("should bump the major version", () => {
    expect(parseVersion("1.2.3").bump("major").toString()).toBe("2.0.0")
    expect(parseVersion("v1.2.3").bump("major").toString()).toBe("2.0.0")
  })

  it("should bump the minor version", () => {
    expect(parseVersion("1.2.3").bump("minor").toString()).toBe("1.3.0")
    expect(parseVersion("v1.2.3").bump("minor").toString()).toBe("1.3.0")
  })

  it("should bump the patch version", () => {
    expect(parseVersion("1.2.3").bump("patch").toString()).toBe("1.2.4")
    expect(parseVersion("v1.2.3").bump("patch").toString()).toBe("1.2.4")
  })

  it("should not bump the version on none", () => {
    expect(parseVersion("1.2.3").bump("none").toString()).toBe("1.2.3")
    expect(parseVersion("v1.2.3").bump("none").toString()).toBe("1.2.3")
  })

  it("should retain prerelease and build on bump", () => {
    const version = parseVersion("1.2.3").withPrerelease(["alpha", "1"]).withBuild(["build", "001"])

    expect(version.bump("patch").toString()).toBe("1.2.4-alpha.1+build.001")
  })
})
