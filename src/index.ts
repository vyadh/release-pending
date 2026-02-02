/**
 * Entrypoint for the action, indirection used to help maximise unit test coverage.
 */

import { main } from "@/main"

// Only run the action when this file is executed directly (e.g. `node src/index.js`).
// This prevents side effects (reading GITHUB_TOKEN) when the module is imported by tests.
// todo doesn't work
if (import.meta && import.meta.main) {
  await main()
}
