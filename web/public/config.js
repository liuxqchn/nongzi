/**
 * 运行时配置（静态文件，部署后也能直接改，改完刷新即可生效，无需重新打包）。
 * 如果想用飞书多维表格作为数据源：
 *   1. 把 bitable.enabled 改成 true
 *   2. 填入 app_token（多维表格 URL 里 app_token= 后面那段）
 *   3. 填入 table_id（表名后 /tblXXXX 那段）
 *   4. 填入 token：一个能读该表的用户访问令牌（user_access_token）或 tenant_access_token
 *      注意：token 会暴露在浏览器里，只适合只读场景；正式环境建议由后端代理。
 */
window.__NONGZI_CONFIG__ = {
  shop: {
    name: '农资商品目录',
    subtitle: '扫码看成分 · 查用法 · 一键问价',
    // 店主电话：每个商品也可以单独配置自己的电话，这里的值作为兜底
    phone: '',
  },
  bitable: {
    enabled: false,
    appToken: '',
    tableId: '',
    token: '',
    pageSize: 500,
    domain: 'https://open.feishu.cn',
  },
  // auto | bitable | local
  source: 'auto',
}
