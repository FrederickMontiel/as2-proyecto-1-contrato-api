/**
 * cartera.ts — contrato del recurso Cartera en riesgo.
 *
 * Caso de uso: ConsultarCarteraEnRiesgo (puerto primario del Proyecto 1).
 * Es una consulta: GET, segura e idempotente por definición del método
 * (RFC 9110).
 */

import { z } from "zod";
import { Dinero, FechaISO } from "./comunes.ts";

export const TramoCartera = z.object({
  tramo: z.enum(["mora_1", "mora_2", "mora_3", "vencido"]),
  creditos: z.int().min(0).meta({ example: 3 }),
  saldoCapital: Dinero,
});

/**
 * La fecha de corte es OBLIGATORIA, nunca "hoy" por omisión. Si el servidor
 * decidiera la fecha, la misma consulta devolvería resultados distintos en
 * momentos distintos: una auditoría no puede reproducir un indicador que
 * depende del reloj de quien lo consultó. `incluirReestructurados` es
 * opcional porque la propuesta de arquitectura (sección 2.6) ya define la
 * política por omisión: la cartera en riesgo incluye los reestructurados.
 */
export const CarteraEnRiesgoQuery = z
  .object({
    fechaCorte: FechaISO,
    incluirReestructurados: z
      .boolean()
      .default(true)
      .optional()
      .meta({
        description:
          "Si se incluyen los créditos reestructurados en el saldo en riesgo. Por omisión true, conforme a la política institucional.",
      }),
  })
  .meta({ id: "CarteraEnRiesgoQuery" });

/**
 * Junto al porcentaje es OBLIGATORIO devolver lo dado por incobrable en el
 * período (sección 2.6 y el escenario numérico de referencia: al declarar
 * C-005 incobrable, la cartera activa baja de Q800,000 a Q792,000 y el
 * indicador de Q56,000/Q800,000 = 7.00% pasa a Q48,000/Q792,000 = 6.06%).
 * Reportar solo el porcentaje permitiría que la gerencia decidiera sobre una
 * ilusión: una cartera que "mejoró" porque se dio de baja, no porque cobró.
 */
export const CarteraEnRiesgoResponse = z
  .object({
    fechaCorte: FechaISO,
    carteraActiva: Dinero,
    saldoEnRiesgo: Dinero,
    porcentajeEnRiesgo: z.number().min(0).max(1).meta({ example: 0.07 }),
    dadoPorIncobrableEnElPeriodo: Dinero,
    porTramo: z.array(TramoCartera),
  })
  .meta({ id: "CarteraEnRiesgoResponse" });
