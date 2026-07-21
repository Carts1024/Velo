import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repositoryRoot, "packages/velo-wallets/dist/cdn/velo-wallet.js");
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "packages/velo-wallets/package.json"), "utf8"),
);
const destinations = [
  path.join(repositoryRoot, "apps/web/public/wallets/v1/velo-wallet.js"),
  path.join(repositoryRoot, "apps/web/public/wallets/v1.0.0/velo-wallet.js"),
];

for (const destination of destinations) {
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(`Staged ${packageJson.name}@${packageJson.version} CDN bundle at /wallets/v1 and /wallets/v1.0.0.`);
