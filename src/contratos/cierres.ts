/**
 * cierres.ts — contrato del recurso Cierre.
 *
 * Casos de uso: GenerarCierreDiario, GenerarCierreMensual (sección 3.3 y
 * 2.6 del modelo de dominio). Los cierres deben ser IDEMPOTENTES: generar
 * el cierre de una fecha ya cerrada devuelve el cierre existente (200), no
 * un duplicado. Los saldos se reconstruyen desde los movimientos; el
 * historial nunca se sobrescribe.
 */

import { z } from "zod";
import { CierreId, Dinero, FechaISO, InstanteISO } from "./comunes.ts";

export const GenerarCierreDiarioRequest = z
  .object({
    fechaCorte: FechaISO,
  })
  .meta({ id: "GenerarCierreDiarioRequest" });

export const GenerarCierreMensualRequest = z
  .object({
    mesCorte: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "Formato AAAA-MM")
      .meta({ description: "Mes que se cierra, formato AAAA-MM", example: "2026-08" }),
  })
  .meta({ id: "GenerarCierreMensualRequest" });

export const CierreResponse = z
  .object({
    cierreId: CierreId,
    tipo: z.enum(["diario", "mensual"]),
    fechaCorte: FechaISO,
    carteraActiva: Dinero,
    saldoEnRiesgo: Dinero,
    dadoPorIncobrableEnElPeriodo: Dinero,
    generadoEn: InstanteISO,
    reproducido: z
      .boolean()
      .meta({ description: "true si el cierre para esta fecha ya existía y se devolvió sin regenerarlo" }),
  })
  .meta({ id: "CierreResponse" });
