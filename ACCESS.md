# Cloudflare Access 访问保护

登录由 Cloudflare Access 管理，服务端中间件使用 jose 验证 `Cf-Access-Jwt-Assertion` 的 RS256 签名、issuer、应用 AUD、签发时间和过期时间。公钥来自指定团队的 `/cdn-cgi/access/certs`，会缓存并支持密钥轮换。任何验证失败都拒绝请求，不回退到原 API Token 或同源判断。

生产环境需要在 Vercel 中配置 `CF_ACCESS_ISSUER` 和 `CF_ACCESS_AUD`。当前团队域名为 `https://iieaccess.cloudflareaccess.com`，应用域名为 `duo.iduan.me`。缺失生产配置返回 503；无效或缺失 JWT 返回 403。静态公共资源不包含学习数据；所有动态页面、配置和 API 均经过中间件。通过验证的响应设置 `Cache-Control: private, no-store`，避免 CDN 共享学习数据。

Cloudflare 中保持 `duo.iduan.me` 为代理 DNS 记录，Access 应用路径留空，保护整个域名。Allow 策略仅包含允许的完整邮箱地址。不要添加 Everyone 或 Bypass 策略。仅从默认 Vercel 地址访问会被拒绝；有效的 Access JWT 是持有者凭据，不能泄露。

更换 Access 应用或团队后，应更新 Vercel 的 issuer/AUD 并重新部署。公钥服务不可用时拒绝无法验证的请求，不关闭鉴权。JWT 登录过期后经自定义域名重新登录。

检查：`node --test tests/access.test.ts`，随后 `npm run build`。上线后确认未登录的自定义域名跳转 Access、Vercel 默认域名及其 `/api/data`、`/api/ai`、`/api/config` 拒绝访问，伪造 JWT 和旧 API Token 不能绕过；再从真实 Access 登录会话验证页面及 API。

本地开发不配置这两项时允许访问；若 `.env.local` 配置了两项，本地同样要求 Access JWT。

## GitHub 自动部署

生产项目 `withduans-projects/duodash` 已连接 `withduan/duodash`，推送 `main` 触发 Vercel 生产部署。个人凭据仅保存在本地 `.env.local` 和 Vercel 环境变量中，不提交到 Git。Cloudflare SSL/TLS 使用 Full (strict)，避免 Vercel 强制 HTTPS 与 Flexible 模式形成重定向循环。

本地 `origin` 指向个人 Fork，`upstream` 指向 `Eyozy/duodash`。同步上游时先检查并合并改动，保留 `src/utils/access.ts` 和中间件鉴权；测试及构建通过后再推送。不要直接用上游版本覆盖生产代码。

Vercel 报仓库不存在时，检查 GitHub Vercel App 是否允许访问本仓库；若 GitHub 集成返回 `401 Bad credentials`，在 Vercel 账号认证设置中重新连接 GitHub。提交应使用个人 GitHub 已关联的作者身份，避免沿用上游作者导致部署权限检查失败。
