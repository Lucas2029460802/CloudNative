import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/server.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  clean: true,
  // Bundle every dependency so the runtime image needs no node_modules.
  noExternal: [/.*/],
})
