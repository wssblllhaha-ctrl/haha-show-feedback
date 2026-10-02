// 用 GitHub Contents API 把本地文件推到 haha-show-feedback 仓库。
// 存在的意义：本机 git 的 CONNECT 隧道被代理拒（502），而 https 的 REST API 走得通，
// 所以绕过 git push，直接用 API 提交。
//
// 用法：
//   GITHUB_TOKEN=xxx node push-via-api.mjs
//
// token 只从环境变量读，不落盘、不提交。
import fs from "node:fs/promises";
import path from "node:path";

const OWNER = "wssblllhaha-ctrl";
const REPO = "haha-show-feedback";
const PROXY = "http://127.0.0.1:58358";
const TOKEN = process.env.GITHUB_TOKEN;

// 分三批提交：每批一次 commit，避免同一分支上的内容冲突。
const BATCHES = [
  { message: "加 issue 表单模板", files: [".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/suggestion.yml", ".github/ISSUE_TEMPLATE/config.yml"] },
  { message: "建反馈说明与推送备忘", files: ["README.md", "PUSH.md"] },
  { message: "记录 iOS 深色模式已知问题", files: ["issues/known-ios-dark-mode.md"] },
];

const root = process.cwd();

async function api(method, url, body) {
  // Node 的 fetch 在本机被 DNS 黑洞 + 代理 CONNECT(502) 双重挡死，
  // 所以这里把请求交给 curl 走代理，最稳。
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
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
  const text = stdout.slice(0, marker);
  const code = Number(stdout.slice(marker + 9));
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { code, json, text };
}

async function main() {
  if (!TOKEN) {
    console.error("缺少 GITHUB_TOKEN 环境变量。");
    process.exit(2);
  }
  const check = await api("GET", `https://api.github.com/repos/${OWNER}/${REPO}`);
  if (check.code !== 200) {
    console.error(`仓库读不到（HTTP ${check.code}）: ${check.text.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`仓库 ${check.json.full_name} 可访问，默认分支 ${check.json.default_branch}。\n`);

  for (const batch of BATCHES) {
    const files = [];
    for (const relative of batch.files) {
      const content = await fs.readFile(path.join(root, relative), "utf8");
      files.push({ path: relative, content: Buffer.from(content, "utf8").toString("base64"), encoding: "utf8" });
    }
    const res = await api("POST", `https://api.github.com/repos/${OWNER}/${REPO}/git/trees`, {
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: Buffer.from(f.content, "base64").toString("utf8") })),
    });
    if (res.code !== 201) {
      console.error(`建 tree 失败（HTTP ${res.code}）: ${res.text.slice(0, 300)}`);
      process.exit(1);
    }
    const head = await api("GET", `https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/${check.json.default_branch}`);
    const parents = head.code === 200 ? [head.json.object.sha] : [];
    const commit = await api("POST", `https://api.github.com/repos/${OWNER}/${REPO}/git/commits`, {
      message: batch.message,
      tree: res.json.sha,
      parents,
      author: { name: "ChenBo", email: "chenbo@placeholder.local" },
    });
    if (commit.code !== 201) {
      console.error(`建 commit 失败（HTTP ${commit.code}）: ${commit.text.slice(0, 300)}`);
      process.exit(1);
    }
    const ref = await api("POST", `https://api.github.com/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${check.json.default_branch}`,
      sha: commit.json.sha,
    });
    // 第二次之后 ref 已存在，要 PATCH 更新
    if (ref.code === 422) {
      const patch = await api("PATCH", `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${check.json.default_branch}`, { sha: commit.json.sha });
      if (patch.code !== 200) {
        console.error(`更新 ref 失败（HTTP ${patch.code}）: ${patch.text.slice(0, 300)}`);
        process.exit(1);
      }
    } else if (ref.code !== 201) {
      console.error(`建 ref 失败（HTTP ${ref.code}）: ${ref.text.slice(0, 300)}`);
      process.exit(1);
    }
    console.log(`✓ ${batch.message}  ->  ${commit.json.sha.slice(0, 8)}  (${batch.files.length} 个文件)`);
  }
  console.log("\n全部提交完成。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
