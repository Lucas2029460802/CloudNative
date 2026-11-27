import { mkdirSync } from "node:fs"

const CLIPS: ReadonlyArray<readonly [number, number]> = [
  [0, 44],
  [45, 89],
  [90, 128],
  [129, 173],
  [174, 220],
]

function run(cmd: string[]) {
  const result = Bun.spawnSync(cmd, {
    stdio: ["inherit", "inherit", "inherit"],
  })
  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1)
  }
}

mkdirSync("assets/morph", { recursive: true })

for (const [index, [start, end]] of CLIPS.entries()) {
  run([
    "bunx",
    "remotion",
    "render",
    "morph/index.ts",
    "Morph",
    `assets/morph/clip-${index}.mp4`,
    `--frames=${start}-${end}`,
    "--codec=h264",
    "--crf=18",
    "--color-space=bt709",
    "--pixel-format=yuv420p",
  ])
  run([
    "bunx",
    "remotion",
    "still",
    "morph/index.ts",
    "Morph",
    `assets/morph/still-${index}.png`,
    `--frame=${end}`,
  ])
}
