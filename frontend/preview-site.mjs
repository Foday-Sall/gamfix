#!/usr/bin/env node
// Local stand-in for Vercel: serves dist/ with the redirects and rewrites of
// vercel.json, so the site can be checked exactly as Vercel will route it.
//
//   cd frontend && npm run build && npm run preview   -> http://localhost:4173
//
// /api/* is proxied to the real backend (the first rewrite in vercel.json).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(frontend, '..')
const config = JSON.parse(readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'))
const output = path.join(repoRoot, config.outputDirectory || 'frontend/dist')
const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '127.0.0.1'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

/** Vercel route syntax: `:name` is one path segment, `:name*` any number. */
function compile(source) {
  const names = []
  let pattern = ''
  let buffer = ''
  const flush = () => {
    // Escape everything literal, but only outside the placeholders.
    pattern += buffer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    buffer = ''
  }
  const placeholder = /:(\w+)(\*)?/g
  let last = 0
  let match
  while ((match = placeholder.exec(source)) !== null) {
    buffer += source.slice(last, match.index)
    flush()
    names.push(match[1])
    pattern += match[2] ? '(.*)' : '([^/]+)'
    last = placeholder.lastIndex
  }
  buffer += source.slice(last)
  flush()
  // A trailing slash is normalised away by Vercel before routes are checked.
  const regex = new RegExp(`^${pattern}/?$`)
  return (pathname) => {
    const m = pathname.match(regex)
    if (!m) return null
    return Object.fromEntries(names.map((name, index) => [name, m[index + 1] ?? '']))
  }
}

function fill(destination, params) {
  return destination
    .replace(/:(\w+)\*/g, (_, name) => params[name] ?? '')
    .replace(/:(\w+)/g, (_, name) => encodeURIComponent(params[name] ?? ''))
}

/** The static file Vercel would serve for a path, or null. */
function staticFile(pathname) {
  const file = path.join(output, path.normalize(pathname))
  if (file !== output && !file.startsWith(output + path.sep)) return null
  if (!existsSync(file)) return null
  if (statSync(file).isDirectory()) {
    const index = path.join(file, 'index.html')
    return existsSync(index) ? index : null
  }
  return file
}

function sendFile(res, file) {
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(res)
}

function proxy(req, res, target) {
  const upstream = new URL(target)
  const headers = { ...req.headers, host: upstream.hostname }
  const forward = (upstream.protocol === 'https:' ? httpsRequest : httpRequest)(
    { hostname: upstream.hostname, port: upstream.port || undefined, method: req.method, path: upstream.pathname + upstream.search, headers },
    (answer) => {
      const responseHeaders = { ...answer.headers }
      for (const hop of ['connection', 'keep-alive', 'transfer-encoding']) delete responseHeaders[hop]
      res.writeHead(answer.statusCode ?? 502, responseHeaders)
      answer.pipe(res)
    },
  )
  forward.on('error', (error) => {
    console.error(`proxy error for ${req.method} ${req.url}: ${error.message}`)
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(`The API did not answer: ${error.message}`)
  })
  req.pipe(forward)
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)

  // 1. Redirects are checked first; the query string is carried along.
  for (const rule of config.redirects ?? []) {
    const params = compile(rule.source)(pathname)
    if (!params) continue
    const location = fill(rule.destination, params)
    res.writeHead(rule.permanent ? 308 : 307, { location: location + (url.search && !location.includes('?') ? url.search : '') })
    return res.end()
  }

  // 2. A real file wins over every rewrite.
  const file = staticFile(pathname)
  if (file) return sendFile(res, file)

  // 3. Rewrites: to the backend (external URL) or to a document.
  for (const rule of config.rewrites ?? []) {
    const params = compile(rule.source)(pathname)
    if (!params) continue
    const target = fill(rule.destination, params)
    if (/^https?:\/\//.test(target)) return proxy(req, res, target + url.search)
    const document = staticFile(target)
    if (document) return sendFile(res, document)
    break
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('404 - nothing is deployed at this address.')
}).listen(port, host, () => {
  const api = (config.rewrites ?? []).map((rule) => rule.destination).find((destination) => /^https?:\/\//.test(destination))
  console.log(`GamFix site on http://${host}:${port}`)
  console.log(`  landing page   /`)
  console.log(`  web app        /app/login`)
  console.log(`  staff console  /app/dashboard`)
  console.log(`  /api is proxied to ${api ? new URL(api).origin : '(no rewrite found)'}`)
})
