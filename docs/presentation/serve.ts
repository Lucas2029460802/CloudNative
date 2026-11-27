// Serves the built deck (dist/) over HTTP with no network access, for the classroom.
// Run `bun run slides:build` first, then `bun run slides:serve`.
import { resolve, sep } from "node:path"

const dist = resolve(import.meta.dir, "dist")

const server = Bun.serve({
  port: 3030,
  async fetch(request) {
    // Decoding turns %2F and %5C into separators, so resolve() sees every "..".
    const path = resolve(
      dist,
      `.${decodeURIComponent(new URL(request.url).pathname)}`
    )
    const file = Bun.file(path)
    if (path.startsWith(dist + sep) && (await file.exists()))
      return new Response(file)
    // Slidev routes such as /5 are client-side: answer them with the app.
    return new Response(Bun.file(resolve(dist, "index.html")))
  },
  // A malformed path such as /%E0 gets a plain 400, not Bun's error page.
  error: () => new Response("Bad request", { status: 400 }),
})

console.log(`Slides: ${server.url}`)
