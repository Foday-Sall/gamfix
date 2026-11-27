#!/usr/bin/env node
// Builds the whole site into dist/ the way Vercel serves it:
//
//   /                      landing page            (frontend/landing)
//   /app/...               web app                 (frontend/web)
//   /app/dashboard/...     staff console, same web app, second document
//
// Vercel runs this through `npm run build` (see vercel.json). The two
// frontends keep their own package.json and lockfile; nothing is installed at
// the repository root. To force a fresh install:  npm ci --prefix <frontend>
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'dist')

const parts = [
  { name: 'landing page', dir: path.join(root, 'frontend/landing'), base: '/', mount: '' },
  { name: 'web app', dir: path.join(root, 'frontend/web'), base: '/app/', mount: 'app' },
]

function run(command, args, cwd, env = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}   (${path.relative(root, cwd)})`)
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' })
}

function sizeOf(file) {
  return `${(statSync(file).size / 1024).toFixed(0)} kB`
}

function countFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length
}

for (const part of parts) {
  if (!existsSync(path.join(part.dir, 'node_modules'))) {
    run('npm', ['ci'], part.dir)
  }
  // BASE_URL is Vite's public base path: every asset URL of that frontend is
  // built relative to it.
  run('npm', ['run', 'build'], part.dir, { BASE_URL: part.base })
}

rmSync(output, { recursive: true, force: true })
for (const part of parts) {
  const target = path.join(output, part.mount)
  mkdirSync(target, { recursive: true })
  cpSync(path.join(part.dir, 'dist'), target, { recursive: true })
}

const documents = ['index.html', 'app/index.html', 'app/dashboard/index.html']
for (const document of documents) {
  if (!existsSync(path.join(output, document))) {
    console.error(`\nBuild failed: dist/${document} is missing.`)
    process.exit(1)
  }
}

console.log('\nSite built:')
for (const document of documents) {
  console.log(`  dist/${document}  (${sizeOf(path.join(output, document))})`)
}
console.log(`  ${countFiles(output)} files in total -> ${path.relative(process.cwd(), output) || 'dist'}`)
