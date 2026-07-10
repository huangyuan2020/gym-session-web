import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, "index.html"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");
const js = readFileSync(join(root, "app.js"), "utf8");
const icon = readFileSync(join(root, "app-icon.svg"), "utf8");

const iconDataUrl = `data:image/svg+xml,${encodeURIComponent(icon)}`;
const bundled = html
  .replace(/<link rel="icon" href="\.\/app-icon\.svg" type="image\/svg\+xml" \/>\n\s*/u, `<link rel="icon" href="${iconDataUrl}" type="image/svg+xml" />\n    `)
  .replace(/<link rel="manifest" href="\.\/manifest\.webmanifest" \/>\n\s*/u, "")
  .replace(/<link rel="apple-touch-icon" href="\.\/app-icon\.svg" \/>\n\s*/u, `<link rel="apple-touch-icon" href="${iconDataUrl}" />\n    `)
  .replace(/<link rel="stylesheet" href="\.\/styles\.css(?:\?[^"]*)?" \/>\n\s*/u, `<style>\n${css}\n    </style>\n  `)
  .replaceAll('src="./app-icon.svg"', `src="${iconDataUrl}"`)
  .replace(/<script src="\.\/app\.js(?:\?[^"]*)?" defer><\/script>/u, `<script>\n${js.replaceAll("</script", "<\\/script")}\n    </script>`);

writeFileSync(join(root, "phone.html"), bundled);
