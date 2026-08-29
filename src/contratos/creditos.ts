/**
 * creditos.ts — contrato del recurso Crédito.
 *
 * Casos de uso: DesembolsarCredito, ConsultarCredito, ConsultarPlanAmortizacion
 * (sección 3.3 y 3.5 del modelo de dominio). El plan de amortización es
 * inmutable una vez generado; la última cuota siempre se ajusta para que el
 * saldo final sea exactamente Q0.00 (método francés, sección 2.6).
 */

import { z } from "zod";
import { ClienteId, CreditoId, Dinero, EstadoCredito, FechaISO, InstanteISO, SolicitudId, TramoMora } from "./comunes.ts";

export const DesembolsarCreditoRequest = z
  .object({
    fechaDesembolso: FechaISO,
    cuentaDestino: z.string().max(40).optional().meta({ description: "Cuenta o medio por el que se entrega el desembolso" }),
  })
  .meta({ id: "DesembolsarCreditoRequest" });

export const Credito = z
  .object({
    creditoId: CreditoId,
    clienteId: ClienteId,
    solicitudId: SolicitudId,
    estado: EstadoCredito,
    tramoMora: TramoMora,
    diasAtraso: z.int().min(0),
    montoOriginal: Dinero,
    saldoCapital: Dinero,
    tasaAprobadaAnual: z.number().min(0).max(1).meta({ example: 0.36 }),
    plazoMeses: z.int().min(3).max(24),
    fechaDesembolso: FechaISO.optional(),
    creadoEn: InstanteISO,
  })
  .meta({ id: "Credito" });

/**
 * Detalle de una cuota del plan de amortización (método francés). El saldo
 * final de la última cuota siempre es exactamente Q0.00: es un invariante
 * del dominio, no una aproximación.
 */
export const Cuota = z
  .object({
    numero: z.int().min(1),
    vencimiento: FechaISO,
    saldoInicial: Dinero,
    cuota: Dinero,
    interes: Dinero,
    amortizacion: Dinero,
    saldoFinal: Dinero,
    estado: z.enum(["pendiente", "pagada", "vencida"]),
  })
  .meta({ id: "Cuota" });

export const PlanAmortizacionResponse = z
  .object({
    creditoId: CreditoId,
    capital: Dinero,
    tasaMensual: z.number().min(0).max(1).meta({ example: 0.03 }),
    numeroCuotas: z.int().min(3).max(24),
    cuotas: z.array(Cuota),
  })
  .meta({ id: "PlanAmortizacionResponse" });
