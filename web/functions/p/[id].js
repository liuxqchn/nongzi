/**
 * 商品分享页 /p/<record_id>
 *
 * 页面本身还是那个 SPA，但**服务端**返回的 HTML 里已经写好了这个商品的
 * og:title / og:image / JSON-LD。这样：
 *   - 链接发到微信群，卡片有商品名和实物图，而不是一行光秃秃的网址；
 *   - 搜索引擎能直接读到商品名、价格、描述（不依赖 JS 渲染）。
 *
 * 找不到记录（表格删了、id 写错）时照常返回首页的 HTML，由前端回退到目录列表。
 */

import { fetchRecords, publicItems } from '../_lib/feishu.js'
import { buildPageMeta, injectMeta } from '../_lib/meta.js'

export async function onRequestGet({ params, env, request }) {
  const origin = new URL(request.url).origin
  const id = String(params.id || '').replace(/\/+$/, '')

  let html
  try {
    const asset = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url)))
    html = await asset.text()
  } catch {
    return new Response('页面暂不可用，请稍后再试。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  let item = null
  try {
    const { items } = await fetchRecords(env)
    item = publicItems(items, env).find((record) => record.record_id === id) || null
  } catch {
    // 飞书挂了也要能出页面：宁可分享卡片是默认的，也不要 502
  }

  const meta = buildPageMeta({ item, origin })

  // 页面挂在 /p/<id> 下，但 index.html 里的资源写的是相对路径（./favicon.svg），
  // 不补 <base> 会去请求 /p/favicon.svg。SPA 自己的路由不依赖相对路径。
  const page = injectMeta(html, meta).replace('<head>', '<head>\n    <base href="/" />')

  return new Response(page, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 表格改了以后分享卡片要跟着变，所以不缓存 HTML 本身
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
