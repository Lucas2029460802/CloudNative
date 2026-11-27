import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// SLIDES_SINGLE=1 builds one self-contained index.html (see build:single).
const single = process.env.SLIDES_SINGLE === "1"

const subset = (face: string) => ({
  find: `@fontsource/${face}.css`,
  replacement: fileURLToPath(
    new URL(
      `./assets/fonts-subset/${face.replace("/", "-")}.css`,
      import.meta.url
    )
  ),
})

// Slidev splits vendors with manualChunks and sets its own inline limit;
// a single bundle needs one chunk with every asset inlined.
const singleBundle: Plugin = {
  name: "single-bundle",
  enforce: "post",
  config(config) {
    const output = config.build?.rollupOptions?.output
    if (output && !Array.isArray(output)) delete output.manualChunks
    config.build = { ...config.build, assetsInlineLimit: () => true }
  },
}

export default defineConfig(
  single
    ? {
        plugins: [viteSingleFile(), singleBundle],
        resolve: {
          alias: [
            subset("noto-sans-sc/400"),
            subset("noto-sans-sc/700"),
            subset("jetbrains-mono/400"),
          ],
        },
      }
    : {}
)
