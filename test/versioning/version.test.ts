import { describe, expect, it } from "vitest"
import { parseVersion, sanitiseBranchPrerelease } from "@/versioning/version"

describe("basic version parsing", () => {
  it("should parse version with v prefix", () => {
    expect(parseVersion("v1.2.3").toString()).toBe("1.2.3")
  })

  it("should parse standard version", () => {
    const version = parseVersion("2.3.4")

    expect(version.toString()).toBe("2.3.4")
    expect(version.core).toBe("2.3.4")
    expect(version.build).toStrictEqual([])
    expect(version.prerelease).toStrictEqual([])
  })

  it("should parse full version", () => {
    const version = parseVersion("2.3.4-alpha.1+build.number")

    expect(version.toString()).toBe("2.3.4-alpha.1+build.number")
    expect(version.core).toBe("2.3.4")
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

  it("should sanitise branch names for prerelease", () => {
    expect(sanitiseBranchPrerelease("fix/some.thing/else")).toStrictEqual([
      "branch",
      "fix",
      "some",
      "thing",
      "else"
    ])
    expect(sanitiseBranchPrerelease("1`2^3_4-5|6 7")).toStrictEqual(["branch", "1-2-3-4-5-6-7"])
    expect(sanitiseBranchPrerelease("1../2--3///4")).toStrictEqual(["branch", "1", "2-3", "4"])
    expect(sanitiseBranchPrerelease("")).toStrictEqual(["branch"])
    expect(sanitiseBranchPrerelease(".1.2.")).toStrictEqual(["branch", "1", "2"])
    expect(sanitiseBranchPrerelease("_1_2_")).toStrictEqual(["branch", "1-2"])
    expect(sanitiseBranchPrerelease("``1_2``")).toStrictEqual(["branch", "1-2"])
    expect(sanitiseBranchPrerelease("__")).toStrictEqual(["branch"])
    expect(sanitiseBranchPrerelease("01.0.00.02.0a")).toStrictEqual(["branch", "1", "0", "0", "2", "0a"])
    expect(sanitiseBranchPrerelease("1.2.3.4.5.6.7.8.9.10.11")).toStrictEqual([
      "branch",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10"
    ])
    expect(sanitiseBranchPrerelease("123456789012345678901234567890123456789012345678901")).toStrictEqual([
      "branch",
      "12345678901234567890123456789012345678901234567890"
    ])
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
