import { app } from "./app.ts";
import { serveStatic } from "@hono/hono/deno";

const bundled = await Deno.bundle({
  entrypoints: [import.meta.resolve("./client/index.html")],
  outputDir: "/",
  platform: "browser",
}).catch((err) => {
  console.error("Failed to bundle client/index.html:", err);
  return { success: false, outputFiles: [] as Array<Deno.bundle.OutputFile> };
});

app.get("/client/", async (ctx, next) => {
  if (!bundled.success) return await next();
  const path = new URL(ctx.req.url).pathname;
  console.log(path, bundled.outputFiles?.map((f) => f.path));
  const matched = bundled.outputFiles!.find((f) => f.path == path);
  if (matched) {
    return ctx.html(matched!.text());
  }
  return next();
});

app.get("/client/", serveStatic({ path: "./bundled/index.html" }));
app.use(
  serveStatic({
    root: "./bundled/",
    rewriteRequestPath: (path) => path.replace("/client/", "/"),
  }),
);
app.use(serveStatic({ root: "./client/" }));

export default {
  fetch: app.fetch,
};
