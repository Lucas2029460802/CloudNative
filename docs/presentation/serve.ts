// Serves the built deck (dist/) over HTTP with no network access, for the classroom.
// Run `bun run slides:build` first, then `bun run slides:serve`.
const dist = new URL("./dist/", import.meta.url)

const server = Bun.serve({
  port: 3030,
  async fetch(request) {
    // URL parsing already removes "..", so the path stays inside dist/.
    const file = Bun.file(new URL(`.${new URL(request.url).pathname}`, dist))
    if (await file.exists()) return new Response(file)
    // Slidev routes such as /5 are client-side: answer them with the app.
    return new Response(Bun.file(new URL("index.html", dist)))
  },
})

console.log(`Slides: ${server.url}`)
