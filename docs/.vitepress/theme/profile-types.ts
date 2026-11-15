export interface ServerShowcase {
  name: string
  description: string
  javaAddress: string
  bedrockAddress: string
  version: string
  gamemodes: string
  plugins: string
  website: string
  discord: string
  trailer: string
  logo: string
  screenshots: { url: string; alt: string }[]
  featured: boolean
}
