import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
if(await access(path.join(root,'dist/TEST-ONLY')).then(()=>true,()=>false))throw Error('拒绝打包测试密钥构建，请重新执行正式构建');
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(
  await readFile(path.join(root, "dist/manifest.json"), "utf8"),
);
if (pkg.version !== manifest.version)
  throw new Error("构建版本与工程版本不一致，请重新构建");
const artifacts = path.join(root, "artifacts");
await mkdir(artifacts, { recursive: true });
const target = path.join(artifacts, `hongguo-web-${pkg.version}.zip`);
const quote = (text) => "'" + text.replaceAll("'", "''") + "'";
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path ${quote(path.join(root, "dist", "*"))} -DestinationPath ${quote(target)} -Force`,
  ],
  { stdio: "pipe" },
);
const hash = createHash("sha256")
  .update(await readFile(target))
  .digest("hex");
await writeFile(
  path.join(artifacts, "SHA256SUMS"),
  hash + "  " + path.basename(target) + "\n",
  "utf8",
);
console.log("安装包：" + target);
console.log("SHA-256：" + hash);
