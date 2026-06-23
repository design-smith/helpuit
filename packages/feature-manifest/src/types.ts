/** One product feature and how it maps to code, routes, and reproduction. */
export interface Feature {
  key: string
  name: string
  routes: string[]
  components: string[]
  endpoints: string[]
  docsLinks: string[]
  keywords?: string[]
  /** Sandbox role needed to reproduce in this feature (e.g. "admin"). */
  sandboxRole?: string
}

export interface FeatureManifest {
  /** The repo ref this manifest was built from — the founder-declared production branch. */
  ref: string
  features: Feature[]
}
