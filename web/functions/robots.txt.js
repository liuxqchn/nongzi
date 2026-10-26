/**
 * /robots.txt —— 用请求的域名拼 sitemap 地址，换域名后不用改代码。
 * 商品页是给人看的，没有需要屏蔽的后台路径，所以全站放开。
 */

export async function onRequestGet({ request }) {
  const origin = `https://${new URL(request.url).host}`
  const body = `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
