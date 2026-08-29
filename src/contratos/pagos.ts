/**
 * pagos.ts — contrato del recurso Pago.
 *
 * Caso de uso: RegistrarPago (puerto primario del Proyecto 1) y
 * ConsultarPagos. Es el endpoint más delicado del Sistema: mueve dinero,
 * se puede reintentar, y su resultado depende de la prelación de la
 * sección 2.6 de la propuesta de arquitectura (gastos → interés
 * moratorio → interés corriente → capital).
 */

import { z } from "zod";
import { CreditoId, Dinero, EstadoCredito, FechaISO, InstanteISO, MontoDecimal, TramoMora } from "./comunes.ts";

/* ------------------------------------------------------------------ */
/* Petición                                                            */
/* ------------------------------------------------------------------ */

/**
 * Enumeración CERRADA de medios de pago. Un `string` libre permitiría que
 * cada integrador inventara su propio texto ("Efectivo", "EFECTIVO",
 * "cash"...) y rompería cualquier reporte por canal. Agregar un medio nuevo
 * mañana es un cambio de contrato explícito (nueva versión del enum), no
 * una sorpresa silenciosa para los clientes que ya consumen la API.
 */
export const MedioDePago = z
  .enum(["efectivo", "agente_bancario", "transferencia", "tarjeta"])
  .meta({ id: "MedioDePago", description: "Canal por el que se recibió el pago" });

/**
 * La fecha del pago la envía el CLIENTE, nunca el reloj del servidor
 * (puerto Reloj del Proyecto 1). El asesor que cobra el jueves en campo y
 * sincroniza el sábado debe poder registrar la fecha real del cobro; si el
 * servidor tomara "hoy", la mora y el interés corriente de ese pago se
 * calcularían mal y la prueba dejaría de ser reproducible.
 */
export const RegistrarPagoRequest = z
  .object({
    monto: Dinero,
    fechaPago: FechaISO,
    medio: MedioDePago,
    referencia: z
      .string()
      .max(40)
      .optional()
      .meta({ description: "Referencia externa del pago (boleta, autorización, etc.)", example: "BOL-88213" }),
  })
  .meta({ id: "RegistrarPagoRequest" });

/* ------------------------------------------------------------------ */
/* Respuesta                                                           */
/* ------------------------------------------------------------------ */

/**
 * Desglose del pago, rubro por rubro, en el ORDEN DE PRELACIÓN
 * (gastos → interés moratorio → interés corriente → capital). Si la
 * respuesta solo dijera `{ ok: true }`, el asesor no podría explicarle al
 * cliente que abonó Q500 y ve que su saldo casi no bajó por qué el pago se
 * fue primero a mora e interés.
 */
export const AplicacionDelPago = z
  .object({
    gastos: MontoDecimal.meta({ example: "0.00" }),
    interesMoratorio: MontoDecimal.meta({ example: "7.26" }),
    interesCorriente: MontoDecimal.meta({ example: "278.86" }),
    capital: MontoDecimal.meta({ example: "725.76" }),
    excedente: MontoDecimal.meta({
      description: "Remanente del pago después de saldar todo lo vencido; se aplica como adelanto a capital.",
      example: "0.00",
    }),
  })
  .meta({
    id: "AplicacionDelPago",
    description: "Desglose del pago en el orden de prelación: gastos → moratorio → corriente → capital.",
  });

/**
 * Respuesta del pago registrado. `reproducido` permite al cliente distinguir
 * un pago NUEVO (201, reproducido = false) de la reproducción de uno ya
 * registrado con la misma clave de idempotencia (200, reproducido = true,
 * sin cobrar dos veces). El tramo de mora viaja como clasificación derivada,
 * no como parte del estado.
 */
export const PagoRegistrado = z
  .object({
    pagoId: z.string().meta({ example: "PG-2026-000731" }),
    creditoId: CreditoId,
    recibidoEn: InstanteISO,
    montoRecibido: Dinero,
    aplicacion: AplicacionDelPago,
    saldoCapitalDespues: Dinero,
    estadoCredito: EstadoCredito,
    tramoMora: TramoMora,
    diasAtraso: z.int().min(0).meta({ example: 0 }),
    reproducido: z
      .boolean()
      .meta({ description: "true si esta respuesta es la reproducción de un pago ya registrado con la misma Idempotency-Key" }),
  })
  .meta({ id: "PagoRegistrado" });

/* ------------------------------------------------------------------ */
/* Consulta de pagos de un crédito                                     */
/* ------------------------------------------------------------------ */

// La paginación de esta consulta reutiliza el esquema Paginacion de
// comunes.ts directamente (ver openapi.ts); no necesita un id propio.

export const ListarPagosResponse = z
  .object({
    creditoId: CreditoId,
    pagos: z.array(PagoRegistrado),
    siguienteCursor: z.string().optional(),
  })
  .meta({ id: "ListarPagosResponse" });
