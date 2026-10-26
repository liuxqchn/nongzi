#!/usr/bin/env python3
"""线上体检 + 商品快照。

用法：
    python3 scripts/health-check.py https://nongzi.pages.dev

检查项（任何一项失败都以非 0 退出，让 CI 变红）：
  1. /api/products 返回非空列表，且每条记录都有 record_id；
  2. 表格里第一张附件图片能通过 /api/media 真的取到字节（不是 401/404 的错误页）；
  3. /robots.txt 指向 sitemap、/sitemap.xml 能解析出 URL。

然后写一份 backups/YYYY-MM-DD.json，只保留最近 30 天。
"""

import json
import pathlib
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

KEEP_SNAPSHOTS = 30

# Cloudflare 会直接 403 掉 urllib 默认的 `Python-urllib/3.x` UA（实测：同一条地址
# curl 200、urllib 403），所以体检必须自带一个正常 UA，否则 CI 每天都误报。
USER_AGENT = "nongzi-healthcheck/1.0 (+https://github.com/liuxqchn/nongzi)"


_last_content_type = ""


def fetch(site, path, timeout=30):
    global _last_content_type
    url = path if path.startswith("http") else site + path
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            _last_content_type = response.headers.get("content-type", "")
            return response.status, _last_content_type, response.read()
    except urllib.error.HTTPError as error:
        hint = ""
        if error.code == 403:
            hint = "（403：多半是 User-Agent 又被 Cloudflare 挡了）"
        sys.exit(f"{url} 返回 HTTP {error.code}{hint}")
    except urllib.error.URLError as error:
        sys.exit(f"{url} 连不上：{error.reason}")


def first_media_path(items):
    for row in items:
        for value in (row.get("fields") or {}).values():
            if not isinstance(value, list):
                continue
            for entry in value:
                if isinstance(entry, dict):
                    url = entry.get("url")
                    if isinstance(url, str) and "/api/media" in url:
                        return url
    return ""


def main():
    if len(sys.argv) < 2:
        sys.exit("用法：health-check.py <站点地址>")

    site = sys.argv[1].rstrip("/")
    print(f"探测目标：{site}")

    status, _, body = fetch(site, "/api/products", timeout=40)
    if status != 200:
        sys.exit(f"/api/products 返回 HTTP {status}")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        ctype = _last_content_type
        sys.exit(
            f"/api/products 返回的不是 JSON（content-type: {ctype or '空'}）——"
            "多半是站点没部署 Functions，或者环境变量还没配、请求落到了 index.html"
        )
    items = payload.get("items") if isinstance(payload, dict) else payload
    if not items:
        sys.exit("接口返回的商品列表是空的")
    if any(not row.get("record_id") for row in items):
        sys.exit("有记录缺少 record_id")

    media_path = first_media_path(items)
    if media_path:
        status, ctype, image = fetch(site, media_path)
        if status != 200 or not ctype.startswith("image/"):
            sys.exit(f"图片代理异常：HTTP {status} / {ctype}")
        if len(image) < 500:
            sys.exit(f"图片只有 {len(image)} 字节，可能取到了错误页")
        print(f"图片 OK：{len(image)} 字节 {ctype}")
    else:
        print("表格里还没有附件图片，跳过图片检查")

    status, _, robots = fetch(site, "/robots.txt")
    if status != 200 or b"Sitemap:" not in robots:
        sys.exit("robots.txt 异常")
    status, _, sitemap = fetch(site, "/sitemap.xml")
    if status != 200 or b"<urlset" not in sitemap:
        sys.exit("sitemap.xml 异常")
    print(f"sitemap OK：{sitemap.count(b'<url>')} 条 URL")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    target = pathlib.Path("backups") / f"{today}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(
            {
                "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "count": len(items),
                "items": items,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"快照已写入 {target}（{len(items)} 条商品）")

    old = sorted(pathlib.Path("backups").glob("*.json"))[:-KEEP_SNAPSHOTS]
    for path in old:
        path.unlink()
    if old:
        print(f"清理旧快照 {len(old)} 个")


if __name__ == "__main__":
    main()
