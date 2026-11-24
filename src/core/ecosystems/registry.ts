/**
 * Registry of ecosystem providers. Future ecosystems (Python, IaC,
 * containers, …) register here by implementing the same contract.
 */
import type { EcosystemProvider } from '../contracts/ecosystem-provider'

const providers = new Map<string, EcosystemProvider>()

export function registerProvider(provider: EcosystemProvider): void {
  const id = provider.metadata().id
  if (providers.has(id)) {
    throw new Error(`Ecosystem provider "${id}" is already registered`)
  }
  providers.set(id, provider)
}

export function getProvider(ecosystemId: string): EcosystemProvider | null {
  return providers.get(ecosystemId) ?? null
}

export function getJavaScriptProvider(): EcosystemProvider | null {
  return getProvider('javascript')
}

export function listProviders(): Array<ReturnType<EcosystemProvider['metadata']>> {
  return [...providers.values()].map((p) => p.metadata())
}
