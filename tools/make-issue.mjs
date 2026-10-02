// 建置顶的深色模式 issue。
// 用法：GITHUB_TOKEN=xxx node make-issue.mjs
import fs from "node:fs/promises";
import http from "node:http";
import tls from "node:tls";

const OWNER = "wssblllhaha-ctrl";
const REPO = "haha-show-feedback";
const TOKEN = process.env.GITHUB_TOKEN;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const c = http.request({ host: "127.0.0.1", port: 58358, method: "CONNECT", path: "api.github.com:443", timeout: 30000 });
    c.on("connect", (res, sock) => {
      if (res.statusCode !== 200) { sock.destroy(); return reject(new Error("CONNECT " + res.statusCode)); }
      const s = tls.connect({ socket: sock, servername: "api.github.com" });
      s.on("secureConnect", () => {
        const h = [method + " " + urlPath + " HTTP/1.1", "Host: api.github.com",
          "Authorization: Bearer " + TOKEN, "Accept: application/vnd.github+json",
          "X-GitHub-Api-Version: 2022-11-28", "User-Agent: issue-maker", "Connection: close"];
        if (payload) { h.push("Content-Type: application/json"); h.push("Content-Length: " + payload.length); }
        s.write(h.join("\r\n") + "\r\n\r\n");
        if (payload) s.write(payload);
      });
      let raw = Buffer.alloc(0);
      s.on("data", (d) => { raw = Buffer.concat([raw, d]); });
      s.on("end", () => {
        const t = raw.toString("utf8");
        const i = t.indexOf("\r\n\r\n");
        const head = t.slice(0, i);
        let bt = t.slice(i + 4);
        if (/transfer-encoding:\s*chunked/i.test(head)) {
          bt = bt.split("\r\n").filter((l) => l && !/^[0-9a-f]+$/i.test(l)).join("\n");
        }
        const st = Number((head.match(/^HTTP\/1\.\d (\d+)/) || [])[1] || 0);
        let json = null;
        try { json = JSON.parse(bt); } catch {}
        resolve({ st, text: bt, json });
      });
      s.on("error", reject);
    });
    c.on("timeout", () => { c.destroy(new Error("timeout")); });
    c.on("error", reject);
    c.end();
  });
}

async function main() {
  if (!TOKEN) {
    console.error("缺少 GITHUB_TOKEN 环境变量。");
    process.exit(2);
  }
  const body = await fs.readFile("issues/issue-body.md", "utf8");
  const res = await request("POST", `/repos/${OWNER}/${REPO}/issues`, {
    title: "[已知问题] iOS 深色模式下页面被 Safari 重新上色",
    body,
    labels: ["bug"],
  });
  if (res.st !== 201) {
    console.error("建 issue 失败 HTTP " + res.st + ": " + res.text.slice(0, 400));
    process.exit(1);
  }
  console.log("已建 issue #" + res.json.number);
  console.log(res.json.html_url);

  // 自检：回到能观测的那一层确认它真的在。
  const verify = await request("GET", `/repos/${OWNER}/${REPO}/issues?state=open`);
  if (verify.st !== 200 || !Array.isArray(verify.json) || !verify.json.length) {
    console.error("自检失败：列表里读不到刚建的 issue（HTTP " + verify.st + "）。");
    process.exit(1);
  }
  console.log("自检通过：开放 issue 数 = " + verify.json.length);
}

main().catch((error) => {
  console.error("脚本异常：" + (error.message || error));
  process.exit(1);
});
