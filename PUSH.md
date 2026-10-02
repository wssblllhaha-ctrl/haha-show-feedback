# 往这个仓库推东西

这个目录是 `haha-show-feedback` 仓库的工作副本，与站点仓库（`portfolio-site`）**完全分离** —— 站点怎么改都不会影响这里。

## 网络前提（本机必读）

本机 DNS 会把 `github.com` 解析到一个不通的 IP。直接 `git push` 会卡住或超时，两个办法：

### 办法一：给 git 单独配一个好用的 IP（推荐）

```bash
# 先确认哪个 IP 通（下面两个实测可用）
for ip in 20.27.177.113 20.200.245.247; do
  curl -s -o /dev/null -w "$ip -> %{http_code}\n" --noproxy '*' \
    --resolve github.com:443:$ip -m 8 https://github.com/
done
```

可用 IP 写进 hosts，或者用 `--resolve` 的等价做法（git 不支持 `--resolve`，所以走 hosts 最省事）：

```
# C:\Windows\System32\drivers\etc\hosts
20.27.177.113 github.com
20.27.177.113 api.github.com
```

改 hosts 需要管理员权限，改完 `ipconfig /flushdns`。

### 办法二：只走网页端

文件都在本地，直接把内容复制到 GitHub 网页端新建文件也一样。改 README 这种小事用网页端更快。

## 推送

```bash
cd "C:/Users/25646/Desktop/project/01-应用项目/haha-show-feedback"
git add .
git commit -m "写清楚这次改了什么"
git push
```

首次推送要认证。GitHub 从 2021 年起不接受账号密码，要用 **Personal Access Token**：

1. https://github.com/settings/tokens → Generate new token (classic)
2. 勾 `repo` 权限，有效期按需
3. 推送时 username 填 GitHub 用户名，password 填 token

token 不要写进任何文件，也不要提交进仓库。

## Issue 模板的位置

```
.github/ISSUE_TEMPLATE/
  bug_report.yml     # Bug 报告表单
  suggestion.yml     # 建议表单
  config.yml         # 关掉「空白 issue 之外的联系链接」等杂项
```

改完 push 之后，`/issues/new/choose` 页面就会显示两个表单入口。

`issues/` 目录里放的是**长文说明**（比如那份深色模式的已知问题）。GitHub 的 issue 正文不适合放太长的排查记录，所以长文写在这里，issue 里放摘要 + 链接回来。
