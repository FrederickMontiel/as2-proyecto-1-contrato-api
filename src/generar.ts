/**
 * generar.ts — escribe el contrato en disco.
 *   npm run generar   →   openapi.json  y  openapi.yaml
 *
 * Ambos archivos son ARTEFACTOS GENERADOS: no se editan a mano. Si algo debe
 * cambiar en el contrato, se cambia el esquema Zod y se vuelve a generar.
 */

import { writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { construirDocumento } from "./openapi.ts";

const documento = construirDocumento();

writeFileSync("openapi.json", JSON.stringify(documento, null, 2) + "\n", "utf8");
writeFileSync("openapi.yaml", stringify(documento, { lineWidth: 0 }), "utf8");

const rutas = Object.keys(documento.paths).length;
const esquemas = Object.keys(documento.components.schemas).length;
console.log(`OK · openapi.json y openapi.yaml generados — ${rutas} rutas, ${esquemas} esquemas.`);
