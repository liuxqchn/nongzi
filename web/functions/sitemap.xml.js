/**
 * /sitemap.xml —— 每次请求实时生成，商品增删后不用重新部署。
 * 只列首页 + 每个商品的 /p/<record_id>，并按 record_id 去重。
 */

import { fetchRecords, publicItems } from './_lib/feishu.js'

export async function onRequestGet({ env, request }) {
  const origin = `https://${new URL(request.url).host}`

  let ids = []
  try {
    const { items } = await fetchRecords(env)
    ids = [...new Set(publicItems(items, env).map((item) => item.record_id).filter(Boolean))]
  } catch {
    // 飞书不可用时至少给出首页，别让爬虫拿到 500
  }

  const urls = [
    `<url><loc>${origin}/</loc><changefreq>daily</changefreq></url>`,
    ...ids.map(
      (id) =>
        `<url><loc>${origin}/p/${encodeURIComponent(id)}</loc><changefreq>weekly</changefreq></url>`,
    ),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
