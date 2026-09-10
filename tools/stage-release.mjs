import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function stageRelease(repository, destination) {
  const git = (...args) => execFileSync("git", args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
  const revision = git("rev-parse", "--verify", "HEAD").toString().trim();
  const manifest = git("show", `${revision}:tools/deploy-source.txt`).toString().trim().split("\n");
  if (manifest.some((path) => !path || path.startsWith("/") || path.includes("..") || !/^[A-Za-z0-9_./-]+$/.test(path)))
    throw new Error("Unsafe deployment manifest");
  mkdirSync(destination, { recursive: false });
  const archive = git("archive", "--format=tar", revision, "--", ...manifest);
  execFileSync("tar", ["-xf", "-", "-C", destination], { input: archive });
  writeFileSync(join(destination, "REVISION"), `${revision}\n`);
  return revision;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(stageRelease(process.cwd(), resolve(process.argv[2])));
