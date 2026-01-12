import { describe, it, expect } from "vitest"
import { messageImpact, maxImpact } from "../src/conventional-commits"
import { VersionIncrement } from "../src/versions"

describe("messageImpact", () => {
  describe("MAJOR impact (breaking changes)", () => {
    it("should detect breaking change with ! marker", () => {
      expect(messageImpact("feat!: breaking change")).toBe("major")
    })

    it("should detect breaking change with ! marker and scope", () => {
      expect(messageImpact("feat(api)!: breaking API change")).toBe("major")
    })

    it("should detect BREAKING CHANGE: in message body", () => {
      const message = "feat: new feature\n\nBREAKING CHANGE: this breaks the API"
      expect(messageImpact(message)).toBe("major")
    })

    it("should detect BREAKING-CHANGE: with hyphen", () => {
      const message = "fix: bug fix\n\nBREAKING-CHANGE: incompatible change"
      expect(messageImpact(message)).toBe("major")
    })

    it("should detect breaking change in fix commit", () => {
      expect(messageImpact("fix!: breaking bug fix")).toBe("major")
    })

    it("should detect breaking change in other commit types", () => {
      expect(messageImpact("refactor!: breaking refactor")).toBe("major")
    })
  })

  describe("MINOR impact (features)", () => {
    it("should detect feat type", () => {
      expect(messageImpact("feat: add new feature")).toBe("minor")
    })

    it("should detect feat type with scope", () => {
      expect(messageImpact("feat(auth): add login functionality")).toBe("minor")
    })

    it("should detect feat type with complex scope", () => {
      expect(messageImpact("feat(api-gateway): add new endpoint")).toBe("minor")
    })

    it("should handle feat with multiline message", () => {
      const message = "feat: add authentication\n\nThis adds JWT authentication\nto the API"
      expect(messageImpact(message)).toBe("minor")
    })
  })

  describe("PATCH impact (fixes)", () => {
    it("should detect fix type", () => {
      expect(messageImpact("fix: correct typo")).toBe("patch")
    })

    it("should detect fix type with scope", () => {
      expect(messageImpact("fix(parser): handle edge case")).toBe("patch")
    })

    it("should handle fix with multiline message", () => {
      const message = "fix: resolve memory leak\n\nFixed issue with event listeners"
      expect(messageImpact(message)).toBe("patch")
    })
  })

  describe("NONE impact (other types)", () => {
    it("should return NONE for docs type", () => {
      expect(messageImpact("docs: update README")).toBe("none")
    })

    it("should return NONE for style type", () => {
      expect(messageImpact("style: format code")).toBe("none")
    })

    it("should return NONE for refactor type", () => {
      expect(messageImpact("refactor: clean up code")).toBe("none")
    })

    it("should return NONE for perf type", () => {
      expect(messageImpact("perf: optimize query")).toBe("none")
    })

    it("should return NONE for test type", () => {
      expect(messageImpact("test: add unit tests")).toBe("none")
    })

    it("should return NONE for build type", () => {
      expect(messageImpact("build: update dependencies")).toBe("none")
    })

    it("should return NONE for ci type", () => {
      expect(messageImpact("ci: configure GitHub Actions")).toBe("none")
    })

    it("should return NONE for chore type", () => {
      expect(messageImpact("chore: update config")).toBe("none")
    })

    it("should return NONE for revert type", () => {
      expect(messageImpact("revert: undo last commit")).toBe("none")
    })
  })

  describe("Invalid format", () => {
    it("should return NONE for empty string", () => {
      expect(messageImpact("")).toBe("none")
    })

    it("should return NONE for whitespace only", () => {
      expect(messageImpact("   ")).toBe("none")
    })

    it("should return NONE for message without colon", () => {
      expect(messageImpact("feat add new feature")).toBe("none")
    })

    it("should return NONE for message without description", () => {
      expect(messageImpact("feat:")).toBe("none")
    })

    it("should return NONE for message without description after space", () => {
      expect(messageImpact("feat: ")).toBe("none")
    })

    it("should return NONE for uppercase type", () => {
      expect(messageImpact("FEAT: add feature")).toBe("none")
    })

    it("should return NONE for invalid format", () => {
      expect(messageImpact("random commit message")).toBe("none")
    })

    it("should return NONE for merge commit", () => {
      expect(messageImpact("Merge branch 'main' into develop")).toBe("none")
    })
  })

  describe("Edge cases", () => {
    it("should handle type with unclosed scope parenthesis", () => {
      expect(messageImpact("feat(scope: add feature")).toBe("none")
    })

    it("should handle type with no space after colon", () => {
      expect(messageImpact("feat:add feature")).toBe("minor")
    })

    it("should handle type with multiple spaces after colon", () => {
      expect(messageImpact("feat:   add feature")).toBe("minor")
    })

    it("should handle empty scope", () => {
      expect(messageImpact("feat(): add feature")).toBe("minor")
    })

    it("should handle scope with special characters", () => {
      expect(messageImpact("feat(api-v2): add feature")).toBe("minor")
    })

    it("should prioritize ! marker over type", () => {
      expect(messageImpact("chore!: breaking chore")).toBe("major")
    })
  })
})

describe("maxImpact", () => {
  describe("Single message", () => {
    it("should return same impact when single item", () => {
      expect(maxImpact(["major"])).toBe("major")
      expect(maxImpact(["minor"])).toBe("minor")
      expect(maxImpact(["patch"])).toBe("patch")
      expect(maxImpact(["none"])).toBe("none")
    })
  })

  describe("Multiple messages", () => {
    it("should return MAJOR when any message is breaking", () => {
      const impacts: VersionIncrement[] = ["minor", "patch", "major", "none"]
      expect(maxImpact(impacts)).toBe("major")
    })

    it("should return MINOR when no breaking changes but has features", () => {
      const impacts: VersionIncrement[] = ["minor", "patch", "none"]
      expect(maxImpact(impacts)).toBe("minor")
    })

    it("should return PATCH when only fixes and non-versioning commits", () => {
      const impacts: VersionIncrement[] = ["patch", "none"]
      expect(maxImpact(impacts)).toBe("patch")
    })

    it("should return NONE when all messages are non-versioning", () => {
      const impacts: VersionIncrement[] = ["none", "none"]
      expect(maxImpact(impacts)).toBe("none")
    })
  })

  describe("Mixed conventional and non-conventional commits", () => {
    it("should prioritize valid commits over invalid ones", () => {
      const impacts: VersionIncrement[] = ["none", "patch"]
      expect(maxImpact(impacts)).toBe("patch")
    })
  })

  describe("Edge cases", () => {
    it("should return NONE for empty array", () => {
      expect(maxImpact([])).toBe("none")
    })
  })

  describe("Impact hierarchy", () => {
    it("should prioritize MAJOR over MINOR and PATCH", () => {
      const impacts: VersionIncrement[] = ["patch", "minor", "major"]
      expect(maxImpact(impacts)).toBe("major")
    })

    it("should prioritize MINOR over PATCH", () => {
      const impacts: VersionIncrement[] = ["patch", "patch", "minor"]
      expect(maxImpact(impacts)).toBe("minor")
    })

    it("should prioritize PATCH over NONE", () => {
      const impacts: VersionIncrement[] = ["none", "none", "patch"]
      expect(maxImpact(impacts)).toBe("patch")
    })
  })

  describe("Complex scenarios", () => {
    it("should handle large number of commits", () => {
      const impacts = [...Array(100).fill("none"), "minor"]
      expect(maxImpact(impacts)).toBe("minor")
    })

    it("should handle all impact levels", () => {
      const impacts: VersionIncrement[] = ["major", "minor", "patch", "none"]
      expect(maxImpact(impacts)).toBe("major")
    })
  })
})
