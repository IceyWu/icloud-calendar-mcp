import { readFile, writeFile } from "node:fs/promises";

const packagePath = new URL("../package.json", import.meta.url);
const serverPath = new URL("../server.json", import.meta.url);
const checkOnly = process.argv.includes("--check");

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const serverJson = JSON.parse(await readFile(serverPath, "utf8"));
const npmPackage = serverJson.packages?.find(
  (entry) => entry.registryType === "npm"
);

if (!npmPackage) {
  throw new Error("server.json must contain an npm package entry");
}

if (!checkOnly) {
  serverJson.version = packageJson.version;
  npmPackage.version = packageJson.version;
  await writeFile(serverPath, `${JSON.stringify(serverJson, null, 2)}\n`);
}

const errors = [];
if (packageJson.mcpName !== serverJson.name) {
  errors.push("package.json mcpName must match server.json name");
}
if (packageJson.name !== npmPackage.identifier) {
  errors.push("package.json name must match the server.json npm identifier");
}
if (packageJson.version !== serverJson.version) {
  errors.push("package.json version must match server.json version");
}
if (packageJson.version !== npmPackage.version) {
  errors.push(
    "package.json version must match the server.json package version"
  );
}

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}

console.log(
  `${checkOnly ? "Verified" : "Synchronized"} MCP Registry metadata for ${packageJson.name}@${packageJson.version}`
);
