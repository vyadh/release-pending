/**
 * GitHub related functions. See comment in `core.ts`.
 */

import type { CommandProperties } from "./command"
import type { AnnotationProperties } from "./core"

export type DataItem = null | undefined | string | boolean | number

/**
 * Sanitizes an input into a string so it can be passed into issueCommand safely
 * @param input input to sanitize into a string
 */
export function toCommandValue(input: DataItem): string {
  if (input === null || input === undefined) {
    return ""
  } else if (typeof input === "string") {
    return input
  }
  return JSON.stringify(input)
}

/**
 *
 * @param annotationProperties
 * @returns The command properties to send with the actual annotation command
 * See IssueCommandProperties: https://github.com/actions/runner/blob/main/src/Runner.Worker/ActionCommandManager.cs#L646
 */
export function toCommandProperties(annotationProperties: AnnotationProperties): CommandProperties {
  if (!Object.keys(annotationProperties).length) {
    return {}
  }

  return {
    title: annotationProperties.title,
    file: annotationProperties.file,
    line: annotationProperties.startLine,
    endLine: annotationProperties.endLine,
    col: annotationProperties.startColumn,
    endColumn: annotationProperties.endColumn
  }
}
