import { Octokit } from "octokit"
import { ProxyAgent } from "undici"
import { fetch as undiciFetch } from "undici"

/**
 * Configuration for creating an Octokit instance
 */
export interface OctokitConfig {
  auth?: string
  proxyUrl?: string
}

/**
 * Creates an Octokit instance configured with proxy support
 */
export function createOctokit(config: OctokitConfig): Octokit {
  const options: ConstructorParameters<typeof Octokit>[0] = {
    auth: config.auth
  }

  // Configure proxy if URL is provided
  if (config.proxyUrl) {
    const proxyAgent = new ProxyAgent(config.proxyUrl)
    options.request = {
      fetch: (url: string | URL | Request, init?: RequestInit) => {
        return undiciFetch(url, {
          ...init,
          dispatcher: proxyAgent
        })
      }
    }
  } else {
    // Use undici fetch without proxy
    options.request = {
      fetch: undiciFetch as typeof fetch
    }
  }

  return new Octokit(options)
}
