import {describe, expect, it} from "vitest"
import {parse} from "@/versioning/version"

describe("basic version parsing", () => {
  it("should parse version with v prefix", () => {
    expect(parse("v1.2.3").toString()).toBe("1.2.3")
  })

  it("should parse standard version", () => {
    expect(parse("2.3.4").toString()).toBe("2.3.4")
  })

  it("should parse full version", () => {
    let version = parse("2.3.4-alpha+build.number");
    expect(version.toString()).toBe("2.3.4-alpha+build.number")
    expect(version.base).toBe("2.3.4")
    expect(version.prerelease).toBe("alpha")
    expect(version.build).toStrictEqual(["build", "number"])
  })

  it("should error on invalid version", () => {
    expect(() => parse("")).toThrow("Invalid Version: ")
    expect(() => parse("1.b.3")).toThrow("Invalid Version: 1.b.3")
    expect(() => parse("1.2.3.4")).toThrow("Invalid Version: 1.2.3.4")
  })
})

describe("prereleases", () => {
  it("should format version with prerelease", () => {
    let version = parse("1.0.0")

    version.prerelease = "pre"

    expect(version.prerelease).toBe("pre")
    expect(version.toString()).toBe("1.0.0-pre")
  })
})

describe("builds", () => {
  it("should format version with build", () => {
    let version = parse("1.0.0")
    expect(version.build).toStrictEqual([])

    version.build = ["a", "b", "c"]
    expect(version.toString()).toBe("1.0.0+a.b.c")
  })
})

describe("combined prerelease and build", () => {
  it("should format version with prerelease and build", () => {
    let version = parse("2.1.1")

    version.prerelease = "beta"
    version.build = ["a", "b", "c"]

    expect(version.toString()).toBe("2.1.1-beta+a.b.c")
  })
})

describe("tag version", () => {
  it("should return the version tag with v prefix", () => {
    expect(parse("1.2.3").tag).toBe("v1.2.3")
    expect(parse("v2.3.4").tag).toBe("v2.3.4")
  })
  it("should return no metadata", () => {
    expect(parse("1.2.3-alpha+build").tag).toBe("v1.2.3")
  })
})

describe("bump", () => {
  it("should bump the major version", () => {
    expect(parse("1.2.3").bump("major").toString()).toBe("2.0.0")
    expect(parse("v1.2.3").bump("major").toString()).toBe("2.0.0")
  })

  it("should bump the minor version", () => {
    expect(parse("1.2.3").bump("minor").toString()).toBe("1.3.0")
    expect(parse("v1.2.3").bump("minor").toString()).toBe("1.3.0")
  })

  it("should bump the patch version", () => {
    expect(parse("1.2.3").bump("patch").toString()).toBe("1.2.4")
    expect(parse("v1.2.3").bump("patch").toString()).toBe("1.2.4")
  })

  it("should not bump the version on none", () => {
    expect(parse("1.2.3").bump("none").toString()).toBe("1.2.3")
    expect(parse("v1.2.3").bump("none").toString()).toBe("1.2.3")
  })

  it("should lose prerelease but not build on bump", () => {
    expect(parse("1.2.3").bump("none").toString()).toBe("1.2.3")
  })
})
