import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, readdir, stat, open } from 'node:fs/promises'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const MAX_JAR_SIZE = 32 * 1024 * 1024
export const CHUNK_SIZE = 65536
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function chunks(data) {
  const result = []
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) result.push(data.subarray(offset, offset + CHUNK_SIZE).toString('base64'))
  return result
}

export function selectJar(names, finalName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(finalName)) throw new Error('Unsafe Maven finalName')
  const eligible = names.filter(name => /^[A-Za-z0-9][A-Za-z0-9._+-]*\.jar$/.test(name) &&
    !/^(?:original-|original\.)|-(?:sources|javadoc|tests|test)\.jar$/i.test(name))
  const expected = `${finalName}.jar`
  if (!eligible.includes(expected)) throw new Error('Expected final Maven plugin JAR not found')
  return expected
}

export function manifestVersion(yaml) {
  const match = yaml.match(/^version:\s*["']?([^"'\r\n#]+)["']?\s*(?:#.*)?$/m)
  const version = match?.[1]?.trim()
  if (!version || version.length > 100 || /[$\x00-\x1f]/.test(version)) throw new Error('Plugin manifest has an unresolved or invalid version')
  return version
}

function command(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${program} validation failed`)
  return result.stdout.trim()
}

async function config() {
  const value = JSON.parse(await readFile(resolve(root, '.github/plugin-downloads.json'), 'utf8'))
  if (value.database !== 'lumen-community' || !Array.isArray(value.products) || !value.products.length) throw new Error('Invalid download configuration')
  const seen = new Set()
  const ids = new Set()
  for (const product of value.products) {
    if (!/^LumenStudios0\/[A-Za-z0-9-]+$/.test(product.repository) ||
        !/^[a-z0-9-]+$/.test(product.product_key) || !/^[a-z0-9-]+$/.test(product.product_id) ||
        typeof product.name !== 'string' || !/^[A-Za-z0-9 -]{1,80}$/.test(product.name) ||
        seen.has(product.product_key) || ids.has(product.product_id)) throw new Error('Invalid or duplicate product configuration')
    seen.add(product.product_key)
    ids.add(product.product_id)
  }
  return value
}

async function validateJar(path) {
  const info = await stat(path)
  if (!info.isFile() || !info.size || info.size > MAX_JAR_SIZE) throw new Error('Plugin JAR must be between 1 byte and 32 MiB')
  command('unzip', ['-tqq', path])
  const entries = command('unzip', ['-Z1', path]).split('\n')
  const descriptor = ['plugin.yml', 'paper-plugin.yml'].find(name => entries.includes(name))
  if (!descriptor || !entries.some(name => name.endsWith('.class'))) throw new Error('JAR lacks plugin manifest or compiled classes')
  const yaml = command('unzip', ['-p', path, descriptor])
  const main = yaml.match(/^main:\s*["']?([A-Za-z_$][\w$]*(?:\.[\w$]+)+)["']?\s*(?:#.*)?$/m)?.[1]
  if (!main || !entries.includes(`${main.replaceAll('.', '/')}.class`)) throw new Error('Plugin main class is missing from JAR')
  return { version: manifestVersion(yaml), size: info.size }
}

async function build(product) {
  const source = process.env.SOURCE_DIR
  if (!source || !process.env.BUILD_MANIFEST) throw new Error('Missing private build paths')
  await stat(resolve(source, 'pom.xml'))
  const log = resolve(source, '..', 'plugin-maven.log')
  const handle = await open(log, 'w')
  const result = spawnSync('mvn', ['clean', 'package', '-B', '-ntp'], {
    cwd: source, stdio: ['ignore', handle.fd, handle.fd], timeout: 25 * 60 * 1000,
  })
  await handle.close()
  // Only bounded diagnostics enter Actions logs; no paid source or JAR artifacts
  // are uploaded to GitHub. All build files stay in the runner's temp directory.
  const lines = (await readFile(log, 'utf8')).split('\n')
  const diagnostics = lines.filter(line => /\[ERROR\]|Tests run:|BUILD (SUCCESS|FAILURE)/.test(line))
  console.log(diagnostics.slice(-55).join('\n').replace(/https?:\/\/[^/\s@]+:[^/\s@]+@/g, 'https://[redacted]@'))
  if (result.status !== 0) throw new Error('Maven clean package failed; see bounded diagnostics above. Tests were not skipped.')
  const finalName = command('mvn', ['help:evaluate', '-Dexpression=project.build.finalName', '-q', '-DforceStdout', '-ntp'], source).replace(/\x1b\[[0-9;]*m/g, '')
  const jar = resolve(source, 'target', selectJar(await readdir(resolve(source, 'target')), finalName))
  const details = await validateJar(jar)
  const data = await readFile(jar)
  const sourceCommit = command('git', ['rev-parse', 'HEAD'], source)
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Invalid source commit')
  const manifest = { product_key: product.product_key, jar, filename: basename(jar), ...details,
    sha256: createHash('sha256').update(data).digest('hex'), source_commit: sourceCommit }
  await writeFile(process.env.BUILD_MANIFEST, JSON.stringify(manifest), { mode: 0o600 })
  console.log(`Validated ${product.name}: ${details.version}, ${details.size} bytes, source ${sourceCommit}`)
}

async function database() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !account) throw new Error('Cloudflare D1 credentials are not configured')
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database`
  async function api(url, body) {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
    })
    let payload
    try { payload = await response.json() } catch { throw new Error('Cloudflare D1 returned an invalid response') }
    if (!response.ok || !payload.success || payload.result?.some?.(item => item.success === false)) {
      // Never print response bodies, request headers, or credential-bearing URLs.
      throw new Error(`Cloudflare D1 request failed (HTTP ${response.status}); check D1:Edit access and account configuration`)
    }
    return payload.result
  }
  const databases = await api(`${base}?per_page=100`)
  const db = databases.find(item => item.name === 'lumen-community')
  if (!db?.uuid) throw new Error('Existing lumen-community D1 database not found; no database was created')
  const query = statements => api(`${base}/${encodeURIComponent(db.uuid)}/query`, statements)
  await query([
    { sql: 'CREATE TABLE IF NOT EXISTS studio_downloads (id TEXT PRIMARY KEY,product_id TEXT NOT NULL,product_key TEXT NOT NULL,name TEXT NOT NULL,version TEXT NOT NULL,filename TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,chunk_count INTEGER NOT NULL,source_commit TEXT NOT NULL,created_at TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0)', params: [] },
    { sql: 'CREATE TABLE IF NOT EXISTS studio_download_chunks (download_id TEXT NOT NULL REFERENCES studio_downloads(id) ON DELETE CASCADE,chunk_index INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(download_id,chunk_index))', params: [] },
    { sql: 'CREATE TABLE IF NOT EXISTS studio_build_results (product_key TEXT PRIMARY KEY,repository TEXT NOT NULL,state TEXT NOT NULL,message TEXT NOT NULL,updated_at TEXT NOT NULL)', params: [] },
  ])
  return query
}

async function status(query, product, state, message) {
  await query([{ sql: 'INSERT INTO studio_build_results (product_key,repository,state,message,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(product_key) DO UPDATE SET repository=excluded.repository,state=excluded.state,message=excluded.message,updated_at=excluded.updated_at',
    params: [product.product_key, product.repository, state, message, new Date().toISOString()] }])
}

async function upload(product) {
  const manifest = JSON.parse(await readFile(process.env.BUILD_MANIFEST, 'utf8'))
  const source = resolve(process.env.SOURCE_DIR)
  if (manifest.product_key !== product.product_key || dirname(manifest.jar) !== resolve(source, 'target') ||
      manifest.filename !== basename(manifest.jar) || !/^[a-f0-9]{40}$/.test(manifest.source_commit)) throw new Error('Invalid build manifest')
  selectJar([manifest.filename], manifest.filename.slice(0, -4))
  const details = await validateJar(manifest.jar)
  const data = await readFile(manifest.jar)
  const digest = createHash('sha256').update(data).digest('hex')
  if (details.version !== manifest.version || details.size !== manifest.size || digest !== manifest.sha256) throw new Error('JAR changed after build validation')
  const parts = chunks(data)
  if (createHash('sha256').update(Buffer.concat(parts.map(part => Buffer.from(part, 'base64')))).digest('hex') !== digest) throw new Error('Chunk digest mismatch')
  const query = await database()
  const id = randomUUID()
  await query([{ sql: 'INSERT INTO studio_downloads (id,product_id,product_key,name,version,filename,sha256,size,chunk_count,source_commit,created_at,published) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)',
    params: [id, product.product_id, product.product_key, product.name, manifest.version, manifest.filename, digest, data.length, parts.length, manifest.source_commit, new Date().toISOString()] }])
  for (let offset = 0; offset < parts.length; offset += 5) {
    await query(parts.slice(offset, offset + 5).map((part, index) => ({
      sql: 'INSERT INTO studio_download_chunks (download_id,chunk_index,data) VALUES (?,?,?)', params: [id, offset + index, part],
    })))
  }
  const result = await query([{ sql: 'SELECT COUNT(*) AS count FROM studio_download_chunks WHERE download_id=?', params: [id] }])
  if (Number(result[0]?.results?.[0]?.count) !== parts.length) throw new Error('D1 chunk count verification failed; version remains unpublished')
  await query([{ sql: 'UPDATE studio_downloads SET published=1 WHERE id=? AND sha256=? AND size=? AND chunk_count=?',
    params: [id, digest, data.length, parts.length] }])
  await status(query, product, 'ready', `Built and privately stored ${manifest.version} (${data.length} bytes); tests were not skipped.`)
  console.log(`Privately published ${product.name} ${manifest.version}: ${data.length} bytes, ${parts.length} chunks, SHA-256 ${digest}`)
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,
    `${product.name}: **ready** — ${manifest.version}, ${data.length} bytes; Maven tests enabled. Private D1 only.\n`, { flag: 'a' })
}

async function main() {
  const settings = await config()
  const mode = process.argv[2]
  if (mode === 'matrix') {
    console.log(`products=${JSON.stringify(settings.products)}`)
    return
  }
  const product = settings.products.find(item => item.product_key === process.env.PRODUCT_KEY)
  if (!product) throw new Error('Unknown product key')
  if (mode === 'build') return build(product)
  if (mode === 'upload') return upload(product)
  if (mode === 'failure') {
    const stage = ['checkout', 'maven-or-validation', 'private-upload'].includes(process.env.FAILURE_STAGE) ? process.env.FAILURE_STAGE : 'build'
    await status(await database(), product, 'failed', `${stage} failed. Inspect the private plugin build workflow diagnostics; previous published versions are preserved.`)
    return
  }
  throw new Error('Expected matrix, build, upload or failure command')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Raw network errors can contain credential-bearing headers or URLs.
    console.error(error instanceof TypeError ? 'Network or configuration failure; check Cloudflare connectivity and configuration.' : error.message)
    process.exitCode = 1
  })
}
