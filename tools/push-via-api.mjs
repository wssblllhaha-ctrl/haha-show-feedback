// 用 GitHub Contents API 把本地文件推到 haha-show-feedback 仓库。
//
// 为什么不禁用 git push：本机 git 的 CONNECT 隧道被代理拒（502），网页却走得通，
// 所以绕过 git push，直接打 HTTPS REST API。
//
// 为什么不用 curl 子进程：`execFile("curl", ..., { input })` 在本机（Windows + Git Bash）
// 会**挂死**——stdin 管道不通，进程直到超时被杀，一行输出都没有。
// 改用 Node 原生的 http 模块直接对代理发 CONNECT + TLS 请求，行为可预测。
//
// 用法：
//   GITHUB_TOKEN=xxx node tools/push-via-api.mjs
//
// token 只从环境变量读，不落盘、不提交。
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import tls from "node:tls";

const OWNER = "wssblllhaha-ctrl";
const REPO = "haha-show-feedback";
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 58358;
const API_HOST = "api.github.com";
const TOKEN = process.env.GITHUB_TOKEN;

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

// 通过代理发一个 HTTPS 请求。做法：向代理发 CONNECT 建隧道，再在隧道上做 TLS。
function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), "utf8") : null;

    const connectReq = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: "CONNECT",
      path: `${API_HOST}:443`,
      headers: { Host: `${API_HOST}:443` },
      timeout: 30000,
    });

    connectReq.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`代理 CONNECT 失败：HTTP ${res.statusCode}`));
        return;
      }
      const secure = tls.connect({
        socket,
        servername: API_HOST,
        rejectUnauthorized: true,
      });
      secure.on("secureConnect", () => {
        const headers = [
          `${method} ${urlPath} HTTP/1.1`,
          `Host: ${API_HOST}`,
          `Authorization: Bearer ${TOKEN}`,
          "Accept: application/vnd.github+json",
          "X-GitHub-Api-Version: 2022-11-28",
          "User-Agent: haha-show-feedback-push",
          "Connection: close",
        ];
        if (payload) {
          headers.push("Content-Type: application/json");
          headers.push(`Content-Length: ${payload.length}`);
        }
        secure.write(headers.join("\r\n") + "\r\n\r\n");
        if (payload) secure.write(payload);
      });
      let raw = Buffer.alloc(0);
      secure.on("data", (chunk) => { raw = Buffer.concat([raw, chunk]); });
      secure.on("end", () => {
        const text = raw.toString("utf8");
        const split = text.indexOf("\r\n\r\n");
        const head = text.slice(0, split);
        let bodyText = text.slice(split + 4);
        const status = Number((head.match(/^HTTP\/1\.\d (\d+)/) || [])[1] || 0);
        // 可能被分块编码，简单剥掉分块长度前缀
        if (/transfer-encoding:\s*chunked/i.test(head)) {
          bodyText = bodyText
            .split("\r\n")
            .filter((line) => line && !/^[0-9a-f]+$/i.test(line))
            .join("\n");
        }
        let json = null;
        try { json = JSON.parse(bodyText); } catch {}
        resolve({ status, text: bodyText, json });
      });
      secure.on("error", reject);
    });

    connectReq.on("timeout", () => { connectReq.destroy(new Error("连接代理超时")); });
    connectReq.on("error", reject);
    connectReq.end();
  });
}

async function currentSha(relative) {
  const res = await request("GET", `/repos/${OWNER}/${REPO}/contents/${encodeURI(relative)}?ref=main`);
  if (res.status === 200 && res.json?.sha) return res.json.sha;
  return null;
}

async function main() {
  if (!TOKEN) {
    console.error("缺少 GITHUB_TOKEN 环境变量。");
    process.exit(2);
  }

  const check = await request("GET", `/repos/${OWNER}/${REPO}`);
  if (check.status !== 200) {
    console.error(`仓库读不到（HTTP ${check.status}）: ${check.text.slice(0, 200)}`);
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

    const res = await request("PUT", `/repos/${OWNER}/${REPO}/contents/${encodeURI(relative)}`, body);
    if (res.status !== 200 && res.status !== 201) {
      console.error(`✗ ${relative} 失败（HTTP ${res.status}）: ${res.text.slice(0, 300)}`);
      process.exit(1);
    }
    ok += 1;
    console.log(`✓ ${sha ? "更新" : "新增"} ${relative}`);
  }

  console.log(`\n完成：${ok} 个文件已提交到 main。`);

  // 自检：API 说成功不等于真的生效，必须回到能观测的那一层确认。
  const verify = await request("GET", `/repos/${OWNER}/${REPO}/contents/`);
  if (verify.status !== 200 || !Array.isArray(verify.json)) {
    console.error(`自检失败：提交后仍读不到文件（HTTP ${verify.status}）。`);
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
  console.error("脚本异常：", error.message || error);
  process.exit(1);
});
