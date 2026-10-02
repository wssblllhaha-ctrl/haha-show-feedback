# 改站点文字 & 推送反馈仓库

## 一、改站点文字

**核心规矩：改源码，不改编译产物。** `outputs/portfolio-site/` 是构建出来的，直接改它下次构建就被覆盖。

文字分两处住着：

### A. 硬编码在 `portfolio-site/index.html` 里的

| 你想改的 | 在哪 |
| --- | --- |
| 顶栏小字 `A COLLECTION OF CURIOSITY` | 第 50 行 `<span class="brand-sub">` |
| 大标题「把好奇心，做成作品。」 | 第 58 行 `<h1 id="hero-title">` |
| 项目区标题「一些想法，一些实现.」 | 第 72 行 |
| 项目区副标题「为真实的小问题…」 | 第 72 行 `<p>` |
| 空状态文案 | 第 76 行 `id="empty-state"` |
| 「在动手里，找到答案。」及各条原则 | 第 79 行 `about-section` |
| 「知识不止收藏，也值得分享。」 | 第 80 行 `learning-section` |
| 页脚「把好奇留在心里，把作品留在这里。」 | 第 82 行 `<footer>` |
| 浏览器标签页标题 | 第 12 行 `<title>` |

**删掉某行小字**，就是删对应的那个元素。例如删顶栏小字：

```html
<!-- 改前 -->
<span data-profile-name>HA哈</span><span class="brand-sub">A COLLECTION OF CURIOSITY</span>
<!-- 改后 -->
<span data-profile-name>HA哈</span>
```

注意它和名字挤在同一个 `<span>` 里（外层只有一个 `<span>` 包着），删的时候只删 `class="brand-sub"` 那一节，别把 `data-profile-name` 一起带走。

**改完按顺序跑：**

```bash
cd "C:/Users/25646/Desktop/project/01-应用项目/portfolio-site"
node build.mjs      # 重新构建到 outputs/portfolio-site/
node preview.mjs    # 本地开预览，先看对不对
node deploy.mjs     # 确认没问题再发布
```

`preview.mjs` 和 `deploy.mjs` 都别跳。`deploy.mjs` 末尾带线上自检，跑完会实际请求 haha.show 确认生效 —— 这条别删（Cloudflare 会「报 success 但一个资产都没注册」，只有真实请求能暴露）。

### B. 来自 `portfolio.json` 的（项目标题、描述、标签）

项目卡片上的文字不在 `index.html`，在 **`portfolio.json`**：

```bash
grep -n "要改的词" portfolio.json
```

改完同样 `node build.mjs`。

### C. 怎么快速定位

```bash
cd "C:/Users/25646/Desktop/project/01-应用项目/portfolio-site"
grep -rn "要改的那句话" index.html portfolio.json app.js
```

搜到之后**只改 `portfolio-site/` 目录下的文件**（`index.html` / `portfolio.json` / `app.js`），不要动 `outputs/`。

---

## 二、推送 haha-show-feedback

### 本机网络的坑（为什么不能用普通 git push）

| 通道 | 结果 |
| --- | --- |
| 直连 `github.com`（DNS `20.205.243.166`） | 超时不通 |
| 直连可用 IP（`20.27.177.113` / `20.200.245.247`） | 网页 200，但 **git 端点 curl 不通** |
| 走系统代理 `http://127.0.0.1:58358` | 网页 200，但 **git 的 CONNECT 隧道被拒 502** |
| 走系统代理访问 **REST API** | **200 可用** ← 走这条 |

结论：本机 git 协议不通，但 HTTPS REST API 通。所以用 `tools/push-via-api.mjs` 走 API 提交。

### 用法

需要你的 GitHub Personal Access Token：

1. 打开 https://github.com/settings/tokens → **Generate new token (classic)**
2. 勾 **`repo`** 权限，有效期按需（30 天足够）
3. 生成后**只复制一次**，然后：

**在 cmd 里（最省事，推荐）：**

```
cd /d "C:\Users\25646\Desktop\project\01-应用项目\haha-show-feedback"
push.bat 粘贴你的token
```

**在 Git Bash 里：**

```bash
cd "C:/Users/25646/Desktop/project/01-应用项目/haha-show-feedback"
GITHUB_TOKEN=粘贴你的token node tools/push-via-api.mjs
```

> **注意 `VAR=值 命令` 只在 bash 里有效。** 在 cmd 里会报
> `'GITHUB_TOKEN' is not recognized as an internal or external command` ——
> cmd 没有这种前置赋值语法，改用上面的 `push.bat`。

脚本会把本地文件分 3 批提交到 `main`。跑完去仓库页刷新就能看到。

**token 不落盘、不进仓库、不写进任何文件。** 用完可以在 GitHub 上删掉那个 token。
**不要把 token 贴进聊天或截图** —— 一旦贴出就等于公开，要立刻去 GitHub 删掉重建。

### 之后想更新内容

改完本地文件，再跑一次同一个命令。脚本每次都新建 commit，不覆盖历史。

### 如果以后想用普通 git push

要让 git 也走通，只有一条路：**改 hosts 把 `github.com` 指到可用 IP**（需要管理员权限）。

```
# C:\Windows\System32\drivers\etc\hosts
20.27.177.113 github.com
```

改完 `ipconfig /flushdns`。但即便解析对了，git 的 CONNECT 走代理仍会 502，所以要配合 `git config --global http.proxy ""` 清掉代理再直连。可用 IP 会变，不通了就重新探测：

```bash
nslookup github.com 223.5.5.5
```
