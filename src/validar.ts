/**
 * validar.ts — comprueba que el contrato generado sea un documento OpenAPI válido.
 *   npm run validar
 *
 * Un contrato que no valida no es un contrato: es una intención.
 */

import { readFileSync } from "node:fs";
import { Validator } from "@seriousme/openapi-schema-validator";

const documento = JSON.parse(readFileSync("openapi.json", "utf8"));
const validador = new Validator();
const resultado = await validador.validate(documento);

if (resultado.valid) {
  console.log(`OK · documento OpenAPI ${validador.version} válido.`);
} else {
  console.error("FALLÓ la validación del contrato:");
  console.error(JSON.stringify(resultado.errors, null, 2));
  process.exit(1);
}
