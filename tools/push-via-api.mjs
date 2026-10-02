// 用 GitHub Contents API 把本地文件推到 haha-show-feedback 仓库。
//
// 存在的意义：本机 git 的 CONNECT 隧道被代理拒（502），网页却走得通，
// 所以绕过 git push，直接用 HTTPS REST API 提交。
//
// 用法：
//   GITHUB_TOKEN=xxx node push-via-api.mjs
//
// token 只从环境变量读，不落盘、不提交。
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const OWNER = "wssblllhaha-ctrl";
const REPO = "haha-show-feedback";
const PROXY = "http://127.0.0.1:58358";
const TOKEN = process.env.GITHUB_TOKEN;

// 每次运行读全部待推文件。改动过的会更新，新增的会创建。
const FILES = [
  "README.md",
  "PUSH.md",
  "push.bat",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/suggestion.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  "issues/known-ios-dark-mode.md",
  "issues/issue-body.md",
  "tools/push-via-api.mjs",
];

const root = process.cwd();

// Node 的 fetch 在本机被 DNS 黑洞 + 代理 CONNECT(502) 双重挡死，
// 所以把请求交给 curl 走代理。curl 是本机唯一稳定通到 api.github.com 的通道。
async function api(method, url, body) {
  const args = ["-s", "-x", PROXY, "-X", method, "-m", "30", "-w", "\n__CODE__%{http_code}"];
  args.push("-H", `Authorization: Bearer ${TOKEN}`);
  args.push("-H", "Accept: application/vnd.github+json");
  args.push("-H", "X-GitHub-Api-Version: 2022-11-28");
  args.push("-H", "User-Agent: haha-show-feedback-push");
  if (body) {
    args.push("-H", "Content-Type: application/json");
    args.push("--data-binary", "@-");
  }
  args.push(url);
  const options = { maxBuffer: 32 * 1024 * 1024 };
  if (body) options.input = JSON.stringify(body);
  const { stdout } = await run("curl", args, options);
  const marker = stdout.lastIndexOf("\n__CODE__");
  const text = stdout.slice(0, marker < 0 ? stdout.length : marker);
  const code = marker < 0 ? 0 : Number(stdout.slice(marker + 9));
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { code, json, text };
}

// 取某个路径当前的 sha（存在才返回）。Contents API 更新文件必须带 sha。
async function currentSha(relative) {
  const res = await api("GET", `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(relative)}?ref=main`);
  if (res.code === 200 && res.json && res.json.sha) return res.json.sha;
  return null;
}

async function main() {
  if (!TOKEN) {
    console.error("缺少 GITHUB_TOKEN 环境变量。");
    process.exit(2);
  }

  const check = await api("GET", `https://api.github.com/repos/${OWNER}/${REPO}`);
  if (check.code !== 200) {
    console.error(`仓库读不到（HTTP ${check.code}）: ${check.text.slice(0, 200)}`);
    console.error("token 可能已失效、被删，或没有 repo 权限。");
    process.exit(1);
  }
  console.log(`仓库 ${check.json.full_name} 可访问，默认分支 ${check.json.default_branch}。\n`);

  let ok = 0;
  for (const relative of FILES) {
    let content;
    try {
      content = await fs.readFile(path.join(root, relative), "utf8");
    } catch {
      console.log(`-  跳过（本地没有）：${relative}`);
      continue;
    }
    const sha = await currentSha(relative);
    const body = {
      message: sha ? `更新 ${relative}` : `新增 ${relative}`,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: "main",
      committer: { name: "ChenBo", email: "chenbo@placeholder.local" },
    };
    if (sha) body.sha = sha;

    const res = await api("PUT", `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(relative)}`, body);
    if (res.code !== 200 && res.code !== 201) {
      console.error(`✗ ${relative} 失败（HTTP ${res.code}）: ${res.text.slice(0, 300)}`);
      process.exit(1);
    }
    ok += 1;
    console.log(`✓ ${sha ? "更新" : "新增"} ${relative}`);
  }

  console.log(`\n完成：${ok} 个文件已提交到 main。`);

  // 自检：API 说成功不等于真的生效，必须回到能观测的那一层确认。
  // （这条是拿两次 Cloudflare 的假 success 换来的教训，别再省。）
  const verify = await api("GET", `https://api.github.com/repos/${OWNER}/${REPO}/contents/`);
  if (verify.code !== 200 || !Array.isArray(verify.json)) {
    console.error(`自检失败：提交后仍读不到文件（HTTP ${verify.code}）。`);
    process.exit(1);
  }
  const remote = new Set(verify.json.map((entry) => entry.name));
  const missing = ["README.md", "push.bat", ".github"].filter((name) => !remote.has(name));
  if (missing.length) {
    console.error(`自检失败：远端缺少 ${missing.join("、")}。`);
    process.exit(1);
  }
  console.log(`自检通过：远端根目录已有 ${verify.json.length} 个条目。`);
  console.log(`去看看：https://github.com/${OWNER}/${REPO}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
