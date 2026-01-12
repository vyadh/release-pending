import { describe, it, expect } from "vitest"
import { bump, bumpTag } from "../src/versions"

describe("bump", () => {
  it("should bump the major version", () => {
    expect(bump("1.2.3", "major")).toBe("2.0.0")
  })

  it("should bump the minor version", () => {
    expect(bump("1.2.3", "minor")).toBe("1.3.0")
  })

  it("should bump the patch version", () => {
    expect(bump("1.2.3", "patch")).toBe("1.2.4")
  })

  it("should not bump the version on none", () => {
    expect(bump("1.2.3", "none")).toBe("1.2.3")
  })

  it("should throw an error for invalid version", () => {
    expect(() => bump("a.b.c", "major")).toThrow("Invalid version or cannot bump: a.b.c")
  })
})

describe("bumpTag", () => {
  it("should bump a version with the 'v' prefix", () => {
    expect(bumpTag("v1.2.3", "patch", "v0.0.0")).toBe("v1.2.4")
  })

  it("should return default tag when version is null or undefined", () => {
    expect(bumpTag(null, "minor", "v0.1.0")).toBe("v0.1.0")
    expect(bumpTag(undefined, "minor", "v0.1.0")).toBe("v0.1.0")
  })

  it("should throw an error if there is no v prefix in the version", () => {
    expect(() => bumpTag("1.2.3", "major", "v0.0.0")).toThrow("Invalid version tag: 1.2.3")
  })

  it("should throw an error if there is no v prefix in the default value", () => {
    expect(() => bumpTag(null, "minor", "0.1.0")).toThrow("Invalid version tag: 0.1.0")
  })
})
