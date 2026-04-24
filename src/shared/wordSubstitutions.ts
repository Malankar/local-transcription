/**
 * Word substitution pipeline for transcript post-processing.
 *
 * Whisper (and Parakeet) frequently mangle compound tech terms, brand names,
 * and acronyms. This module applies regex word-boundary substitutions to
 * correct the most common failures.
 *
 * Two kinds of entries:
 *  - phrase entries: multi-word patterns ("java script" → "JavaScript")
 *  - word entries:  single-token case fixes ("github" → "GitHub")
 *
 * Phrase entries are applied first so multi-word patterns take priority.
 */

export type SubstitutionEntry = {
  /** Pattern to match (word-boundary anchored, case-insensitive by default) */
  from: string
  /** Exact replacement string */
  to: string
  /** When true the match is case-sensitive. Default: false */
  caseSensitive?: boolean
}

type CompiledEntry = {
  pattern: RegExp
  to: string
}

function compile(entry: SubstitutionEntry): CompiledEntry {
  const flags = entry.caseSensitive ? 'g' : 'gi'
  const escaped = entry.from.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  return { pattern: new RegExp(String.raw`\b` + escaped + String.raw`\b`, flags), to: entry.to }
}

export function applySubstitutions(text: string, entries: SubstitutionEntry[]): string {
  const compiled = entries.map(compile)
  // Multi-word phrases first (longer patterns take priority)
  compiled.sort((a, b) => b.to.length - a.to.length)
  let result = text
  for (const { pattern, to } of compiled) {
    result = result.replace(pattern, to)
  }
  return result
}

// ---------------------------------------------------------------------------
// Built-in dictionary
// ---------------------------------------------------------------------------
// Sources: known Whisper.cpp + Parakeet misrecognition patterns, common ASR
// failure modes for tech vocabulary, and standard programming term spellings.
//
// Pattern convention:
//   "from" uses lowercase / split form (what ASR tends to produce)
//   "to"   uses the canonical spelling
// ---------------------------------------------------------------------------

export const BUILT_IN_SUBSTITUTIONS: SubstitutionEntry[] = [
  // ── Programming languages ────────────────────────────────────────────────
  { from: 'java script', to: 'JavaScript' },
  { from: 'javascript', to: 'JavaScript' },
  { from: 'type script', to: 'TypeScript' },
  { from: 'typescript', to: 'TypeScript' },
  { from: 'python', to: 'Python' },
  { from: 'rust lang', to: 'Rust' },
  { from: 'golang', to: 'Go' },
  { from: 'ruby on rails', to: 'Ruby on Rails' },
  { from: 'c sharp', to: 'C#' },
  { from: 'c plus plus', to: 'C++' },
  { from: 'objective c', to: 'Objective-C' },
  { from: 'kotlin', to: 'Kotlin' },
  { from: 'swift lang', to: 'Swift' },
  { from: 'lua script', to: 'Lua' },
  { from: 'elixir lang', to: 'Elixir' },
  { from: 'haskell', to: 'Haskell' },
  { from: 'scala', to: 'Scala' },
  { from: 'clojure', to: 'Clojure' },
  { from: 'erlang', to: 'Erlang' },
  { from: 'ocaml', to: 'OCaml' },
  { from: 'f sharp', to: 'F#' },
  { from: 'r lang', to: 'R' },
  { from: 'julia lang', to: 'Julia' },
  { from: 'dart lang', to: 'Dart' },
  { from: 'zig lang', to: 'Zig' },

  // ── Frameworks & runtimes ────────────────────────────────────────────────
  { from: 'react js', to: 'React' },
  { from: 'react native', to: 'React Native' },
  { from: 'next js', to: 'Next.js' },
  { from: 'nextjs', to: 'Next.js' },
  { from: 'nuxt js', to: 'Nuxt.js' },
  { from: 'nuxtjs', to: 'Nuxt.js' },
  { from: 'vue js', to: 'Vue.js' },
  { from: 'vuejs', to: 'Vue.js' },
  { from: 'angular js', to: 'Angular' },
  { from: 'svelte kit', to: 'SvelteKit' },
  { from: 'node js', to: 'Node.js' },
  { from: 'nodejs', to: 'Node.js' },
  { from: 'node j s', to: 'Node.js' },
  { from: 'deno js', to: 'Deno' },
  { from: 'bun js', to: 'Bun' },
  { from: 'express js', to: 'Express' },
  { from: 'fastify', to: 'Fastify' },
  { from: 'hono js', to: 'Hono' },
  { from: 'nest js', to: 'NestJS' },
  { from: 'nestjs', to: 'NestJS' },
  { from: 'django', to: 'Django' },
  { from: 'flask', to: 'Flask' },
  { from: 'fast api', to: 'FastAPI' },
  { from: 'fastapi', to: 'FastAPI' },
  { from: 'spring boot', to: 'Spring Boot' },
  { from: 'laravel', to: 'Laravel' },
  { from: 'rails', to: 'Rails' },
  { from: 'phoenix framework', to: 'Phoenix' },
  { from: 'remix js', to: 'Remix' },
  { from: 'astro js', to: 'Astro' },
  { from: 'solid js', to: 'SolidJS' },
  { from: 'solidjs', to: 'SolidJS' },
  { from: 'qwik', to: 'Qwik' },
  { from: 'tauri', to: 'Tauri' },
  { from: 'electron js', to: 'Electron' },
  { from: 'flutter', to: 'Flutter' },

  // ── Build tools & bundlers ───────────────────────────────────────────────
  { from: 'web pack', to: 'webpack' },
  { from: 'vite js', to: 'Vite' },
  { from: 'rollup js', to: 'Rollup' },
  { from: 'esbuild', to: 'esbuild' },
  { from: 'parcel js', to: 'Parcel' },
  { from: 'turbo pack', to: 'Turbopack' },
  { from: 'turbopack', to: 'Turbopack' },
  { from: 'babel js', to: 'Babel' },
  { from: 'gradle', to: 'Gradle' },
  { from: 'maven', to: 'Maven' },
  { from: 'make file', to: 'Makefile' },
  { from: 'cmake', to: 'CMake' },

  // ── Package managers ─────────────────────────────────────────────────────
  { from: 'npm js', to: 'npm' },
  { from: 'yarn pkg', to: 'Yarn' },
  { from: 'pnpm', to: 'pnpm' },
  { from: 'pip install', to: 'pip install' },
  { from: 'cargo', to: 'Cargo' },
  { from: 'homebrew', to: 'Homebrew' },
  { from: 'apt get', to: 'apt-get' },

  // ── Cloud & DevOps ───────────────────────────────────────────────────────
  { from: 'kubernetes', to: 'Kubernetes' },
  { from: 'k 8 s', to: 'Kubernetes' },
  { from: 'k8s', to: 'Kubernetes' },
  { from: 'docker', to: 'Docker' },
  { from: 'docker compose', to: 'Docker Compose' },
  { from: 'terraform', to: 'Terraform' },
  { from: 'ansible', to: 'Ansible' },
  { from: 'jenkins', to: 'Jenkins' },
  { from: 'github actions', to: 'GitHub Actions' },
  { from: 'gitlab ci', to: 'GitLab CI' },
  { from: 'circle ci', to: 'CircleCI' },
  { from: 'circleci', to: 'CircleCI' },
  { from: 'travis ci', to: 'Travis CI' },
  { from: 'aws', to: 'AWS' },
  { from: 'amazon web services', to: 'Amazon Web Services' },
  { from: 'google cloud', to: 'Google Cloud' },
  { from: 'g c p', to: 'GCP' },
  { from: 'azure', to: 'Azure' },
  { from: 'cloud flare', to: 'Cloudflare' },
  { from: 'cloudflare', to: 'Cloudflare' },
  { from: 'vercel', to: 'Vercel' },
  { from: 'netlify', to: 'Netlify' },
  { from: 'heroku', to: 'Heroku' },
  { from: 'fly io', to: 'Fly.io' },
  { from: 'render com', to: 'Render' },
  { from: 'railway app', to: 'Railway' },
  { from: 'supabase', to: 'Supabase' },
  { from: 'firebase', to: 'Firebase' },
  { from: 'planet scale', to: 'PlanetScale' },
  { from: 'planetscale', to: 'PlanetScale' },
  { from: 'neon db', to: 'Neon' },
  { from: 'turso db', to: 'Turso' },

  // ── Source control & hosting ─────────────────────────────────────────────
  { from: 'git hub', to: 'GitHub' },
  { from: 'github', to: 'GitHub' },
  { from: 'git lab', to: 'GitLab' },
  { from: 'gitlab', to: 'GitLab' },
  { from: 'bit bucket', to: 'Bitbucket' },
  { from: 'bitbucket', to: 'Bitbucket' },

  // ── Databases ────────────────────────────────────────────────────────────
  { from: 'post gres', to: 'Postgres' },
  { from: 'postgresql', to: 'PostgreSQL' },
  { from: 'post gres q l', to: 'PostgreSQL' },
  { from: 'my sql', to: 'MySQL' },
  { from: 'sqlite', to: 'SQLite' },
  { from: 'mongo db', to: 'MongoDB' },
  { from: 'mongodb', to: 'MongoDB' },
  { from: 'redis', to: 'Redis' },
  { from: 'cassandra', to: 'Cassandra' },
  { from: 'dynamo db', to: 'DynamoDB' },
  { from: 'dynamodb', to: 'DynamoDB' },
  { from: 'cockroach db', to: 'CockroachDB' },
  { from: 'cockroachdb', to: 'CockroachDB' },
  { from: 'elastic search', to: 'Elasticsearch' },
  { from: 'elasticsearch', to: 'Elasticsearch' },
  { from: 'neo4j', to: 'Neo4j' },
  { from: 'influx db', to: 'InfluxDB' },
  { from: 'influxdb', to: 'InfluxDB' },
  { from: 'click house', to: 'ClickHouse' },
  { from: 'clickhouse', to: 'ClickHouse' },

  // ── APIs & protocols ─────────────────────────────────────────────────────
  { from: 'graph ql', to: 'GraphQL' },
  { from: 'graphql', to: 'GraphQL' },
  { from: 'rest api', to: 'REST API' },
  { from: 'grpc', to: 'gRPC' },
  { from: 'g r p c', to: 'gRPC' },
  { from: 'web socket', to: 'WebSocket' },
  { from: 'websocket', to: 'WebSocket' },
  { from: 'web sockets', to: 'WebSockets' },
  { from: 'websockets', to: 'WebSockets' },
  { from: 'oauth', to: 'OAuth' },
  { from: 'o auth', to: 'OAuth' },
  { from: 'oauth2', to: 'OAuth2' },
  { from: 'openapi', to: 'OpenAPI' },
  { from: 'open api', to: 'OpenAPI' },
  { from: 'json rpc', to: 'JSON-RPC' },
  { from: 'trpc', to: 'tRPC' },
  { from: 't r p c', to: 'tRPC' },

  // ── Data formats ─────────────────────────────────────────────────────────
  { from: 'json', to: 'JSON' },
  { from: 'yaml', to: 'YAML' },
  { from: 'toml', to: 'TOML' },
  { from: 'csv', to: 'CSV' },
  { from: 'xml', to: 'XML' },
  { from: 'html', to: 'HTML' },
  { from: 'css', to: 'CSS' },
  { from: 'svg', to: 'SVG' },
  { from: 'web assembly', to: 'WebAssembly' },
  { from: 'wasm', to: 'Wasm' },

  // ── AI / ML ───────────────────────────────────────────────────────────────
  { from: 'open ai', to: 'OpenAI' },
  { from: 'openai', to: 'OpenAI' },
  { from: 'chat gpt', to: 'ChatGPT' },
  { from: 'chatgpt', to: 'ChatGPT' },
  { from: 'gpt 4', to: 'GPT-4' },
  { from: 'gpt 3', to: 'GPT-3' },
  { from: 'llama', to: 'Llama' },
  { from: 'mistral ai', to: 'Mistral' },
  { from: 'hugging face', to: 'Hugging Face' },
  { from: 'huggingface', to: 'Hugging Face' },
  { from: 'langchain', to: 'LangChain' },
  { from: 'lang chain', to: 'LangChain' },
  { from: 'tensorflow', to: 'TensorFlow' },
  { from: 'tensor flow', to: 'TensorFlow' },
  { from: 'pytorch', to: 'PyTorch' },
  { from: 'py torch', to: 'PyTorch' },
  { from: 'keras', to: 'Keras' },
  { from: 'scikit learn', to: 'scikit-learn' },
  { from: 'sklearn', to: 'scikit-learn' },
  { from: 'pandas', to: 'pandas' },
  { from: 'numpy', to: 'NumPy' },
  { from: 'num py', to: 'NumPy' },
  { from: 'cuda', to: 'CUDA' },
  { from: 'ollama', to: 'Ollama' },
  { from: 'whisper cpp', to: 'whisper.cpp' },
  { from: 'whisper c p p', to: 'whisper.cpp' },
  { from: 'llm', to: 'LLM' },
  { from: 'llms', to: 'LLMs' },
  { from: 'rag', to: 'RAG' },
  { from: 'vector db', to: 'vector DB' },

  // ── Editor & OS tools ────────────────────────────────────────────────────
  { from: 'vs code', to: 'VS Code' },
  { from: 'vscode', to: 'VS Code' },
  { from: 'vim', to: 'Vim' },
  { from: 'neovim', to: 'Neovim' },
  { from: 'jetbrains', to: 'JetBrains' },
  { from: 'intellij', to: 'IntelliJ' },
  { from: 'web storm', to: 'WebStorm' },
  { from: 'webstorm', to: 'WebStorm' },
  { from: 'linux', to: 'Linux' },
  { from: 'ubuntu', to: 'Ubuntu' },
  { from: 'debian', to: 'Debian' },
  { from: 'arch linux', to: 'Arch Linux' },
  { from: 'mac os', to: 'macOS' },
  { from: 'macos', to: 'macOS' },
  { from: 'windows subsystem for linux', to: 'WSL' },
  { from: 'wsl', to: 'WSL' },

  // ── General tech acronyms ────────────────────────────────────────────────
  { from: 'api', to: 'API' },
  { from: 'apis', to: 'APIs' },
  { from: 'sdk', to: 'SDK' },
  { from: 'cli', to: 'CLI' },
  { from: 'ide', to: 'IDE' },
  { from: 'url', to: 'URL' },
  { from: 'urls', to: 'URLs' },
  { from: 'uri', to: 'URI' },
  { from: 'http', to: 'HTTP' },
  { from: 'https', to: 'HTTPS' },
  { from: 'ssh', to: 'SSH' },
  { from: 'ssl', to: 'SSL' },
  { from: 'tls', to: 'TLS' },
  { from: 'dns', to: 'DNS' },
  { from: 'tcp', to: 'TCP' },
  { from: 'udp', to: 'UDP' },
  { from: 'ip address', to: 'IP address' },
  { from: 'crud', to: 'CRUD' },
  { from: 'sql', to: 'SQL' },
  { from: 'nosql', to: 'NoSQL' },
  { from: 'no sql', to: 'NoSQL' },
  { from: 'ui', to: 'UI' },
  { from: 'ux', to: 'UX' },
  { from: 'ci cd', to: 'CI/CD' },
  { from: 'cicd', to: 'CI/CD' },
  { from: 'devops', to: 'DevOps' },
  { from: 'dev ops', to: 'DevOps' },
  { from: 'saas', to: 'SaaS' },
  { from: 'paas', to: 'PaaS' },
  { from: 'iaas', to: 'IaaS' },
  { from: 'orm', to: 'ORM' },
  { from: 'cdn', to: 'CDN' },
  { from: 'cors', to: 'CORS' },
  { from: 'jwt', to: 'JWT' },
  { from: 'regex', to: 'regex' },
  { from: 'regexp', to: 'RegExp' },
  { from: 'async await', to: 'async/await' },
  { from: 'web hook', to: 'webhook' },
  { from: 'webhooks', to: 'webhooks' },
  { from: 'open source', to: 'open-source' },
  { from: 'pull request', to: 'pull request' },
  { from: 'p r', to: 'PR', caseSensitive: false },
  { from: 'repo', to: 'repo' },
  { from: 'monorepo', to: 'monorepo' },
  { from: 'mono repo', to: 'monorepo' },
  { from: 'micro services', to: 'microservices' },
  { from: 'microservices', to: 'microservices' },
  { from: 'serverless', to: 'serverless' },
  { from: 'server less', to: 'serverless' },
  { from: 'load balancer', to: 'load balancer' },
  { from: 'rate limit', to: 'rate limit' },
  { from: 'rate limiting', to: 'rate limiting' },
  { from: 'middleware', to: 'middleware' },
  { from: 'back end', to: 'backend' },
  { from: 'front end', to: 'frontend' },
  { from: 'full stack', to: 'full-stack' },

  // ── General writing ──────────────────────────────────────────────────────
  // Whisper sometimes produces informal contractions or merges/splits words
  { from: 'et cetera', to: 'etc.' },
  { from: 'et cetera.', to: 'etc.' },
  { from: 'in other words', to: 'in other words' },
  { from: 'for example', to: 'for example' },
  { from: 'for instance', to: 'for instance' },
]
