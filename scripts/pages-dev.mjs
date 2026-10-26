#!/usr/bin/env node
/**
 * 本地模拟 Cloudflare Pages：静态资源 + Functions。
 *
 * 为什么需要它：`vite dev` 只会跑前端，`/api/*`、`/p/<id>`、`/sitemap.xml` 这些
 * 都进不去；而“推到 main 再等 Cloudflare 构建”一分钟一轮，排错太慢。
 * 这个脚本直接把 web/functions 里的真代码 import 进来跑，行为跟线上一致。
 *
 * 用法（凭证只从环境变量读，不落盘）：
 *
 *   cd web && npm run build
 *   FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx \
 *   FEISHU_APP_TOKEN=xxx FEISHU_TABLE_ID=tblxxx \
 *   node ../scripts/pages-dev.mjs          # 默认 http://127.0.0.1:4411
 *
 * 支持的路由：/api/products、/api/media、/p/<id>、/sitemap.xml、/robots.txt，
 * 其余路径按静态文件返回，找不到就回落到 index.html（跟 Pages 一致）。
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(process.argv[2] || path.join(here, '..', 'web'))
const PORT = Number(process.argv[3] || 4411)
const DIST = path.join(WEB, 'dist')
const FUNCTIONS = path.join(WEB, 'functions')

if (!fs.existsSync(DIST)) {
  console.error(`找不到 ${DIST}，先跑一次 \`cd web && npm run build\``)
  process.exit(1)
}

const env = {
  FEISHU_APP_ID: process.env.FEISHU_APP_ID || '',
  FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET || '',
  FEISHU_APP_TOKEN: process.env.FEISHU_APP_TOKEN || '',
  FEISHU_TABLE_ID: process.env.FEISHU_TABLE_ID || '',
  FEISHU_DOMAIN: process.env.FEISHU_DOMAIN || '',
  FEISHU_CACHE_TTL: process.env.FEISHU_CACHE_TTL || '',
  FEISHU_HIDDEN_FIELDS: process.env.FEISHU_HIDDEN_FIELDS || '',
}

if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET || !env.FEISHU_APP_TOKEN || !env.FEISHU_TABLE_ID) {
  console.warn('提示：飞书凭证不完整，/api/products 会返回 503（静态页面仍可预览）')
}

// 模拟 Pages 的 env.ASSETS 绑定
env.ASSETS = {
  async fetch(request) {
    const url = new URL(request.url ?? String(request))
    let file = path.join(DIST, decodeURIComponent(url.pathname))
    if (url.pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html')
    }
    return new Response(fs.readFileSync(file), {
      headers: {
        'Content-Type': file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'application/octet-stream',
      },
    })
  },
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.apk': 'application/vnd.android.package-archive',
}

const modules = new Map()
async function load(relative) {
  const file = path.join(FUNCTIONS, relative)
  if (!modules.has(file)) modules.set(file, await import(pathToFileURL(file).href))
  return modules.get(file)
}

function serveStatic(res, pathname) {
  let file = path.join(DIST, decodeURIComponent(pathname))
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
  res.end(fs.readFileSync(file))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const request = new Request(url.toString(), { method: req.method, headers: req.headers })
  const waitUntil = (promise) => Promise.resolve(promise).catch(() => {})

  try {
    let response = null

    if (url.pathname.startsWith('/api/')) {
      const segments = url.pathname
        .replace(/^\/api\/?/, '')
        .split('/')
        .filter(Boolean)
        .map(decodeURIComponent)
      const mod = await load('api/[[path]].js')
      response = await mod.onRequestGet({ request, env, waitUntil, params: { path: segments } })
    } else if (url.pathname.startsWith('/p/')) {
      const mod = await load('p/[id].js')
      response = await mod.onRequestGet({
        request,
        env,
        waitUntil,
        params: { id: decodeURIComponent(url.pathname.slice(3)) },
      })
    } else if (url.pathname === '/sitemap.xml') {
      response = await (await load('sitemap.xml.js')).onRequestGet({ request, env })
    } else if (url.pathname === '/robots.txt') {
      response = await (await load('robots.txt.js')).onRequestGet({ request, env })
    }

    if (!response) return serveStatic(res, url.pathname)

    const body = Buffer.from(await response.arrayBuffer())
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
    res.end(body)
    console.log(
      `${req.method} ${url.pathname}${url.search} -> ${response.status} ${body.length}b`,
    )
  } catch (error) {
    console.error('ERR', url.pathname, error)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(String(error?.stack || error))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`本地 Pages 模拟器：http://127.0.0.1:${PORT}（Ctrl+C 退出）`)
})
