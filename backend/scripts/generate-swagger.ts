import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { swaggerSpec } from "../src/config/swagger.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../swagger.json");

writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2));
console.log(`Swagger spec written to ${outputPath}`);