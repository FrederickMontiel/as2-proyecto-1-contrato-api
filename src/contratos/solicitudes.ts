/**
 * solicitudes.ts — contrato del recurso Solicitud de crédito.
 *
 * Casos de uso: CrearSolicitud, EvaluarSolicitud, AprobarSolicitud,
 * RechazarSolicitud (sección 3.2 y 3.9 del modelo de dominio: la solicitud
 * precede al desembolso y pasa por el Comité de Crédito).
 */

import { z } from "zod";
import { ClienteId, CreditoId, Dinero, InstanteISO, SolicitudId } from "./comunes.ts";

/**
 * Rango de producto fijado por la propuesta de arquitectura (sección 2.6):
 * microcréditos entre Q1,000 y Q25,000, con plazos de 3 a 24 meses. Se
 * valida en el contrato para rechazar solicitudes fuera de rango antes de
 * que lleguen al dominio.
 */
export const CrearSolicitudRequest = z
  .object({
    clienteId: ClienteId,
    montoSolicitado: Dinero.meta({ description: "Debe estar entre Q1,000.00 y Q25,000.00" }),
    plazoMeses: z.int().min(3).max(24).meta({ example: 12 }),
    proposito: z.string().max(200).optional().meta({ example: "Capital de trabajo para negocio de abarrotes" }),
  })
  .meta({ id: "CrearSolicitudRequest" });

export const EstadoSolicitud = z
  .enum(["solicitado", "en_evaluacion", "aprobado", "rechazado"])
  .meta({ id: "EstadoSolicitud" });

export const Solicitud = z
  .object({
    solicitudId: SolicitudId,
    clienteId: ClienteId,
    montoSolicitado: Dinero,
    plazoMeses: z.int().min(3).max(24),
    estado: EstadoSolicitud,
    creadoEn: InstanteISO,
    creditoId: CreditoId.optional().meta({ description: "Se agrega solo si la solicitud fue aprobada y desembolsada" }),
  })
  .meta({ id: "Solicitud" });

export const AprobarSolicitudRequest = z
  .object({
    tasaAprobadaAnual: z
      .number()
      .min(0)
      .max(1)
      .meta({ description: "TNA (tasa nominal anual) aprobada por el Comité, como fracción decimal", example: 0.36 }),
    comentario: z.string().max(300).optional(),
  })
  .meta({ id: "AprobarSolicitudRequest" });

export const RechazarSolicitudRequest = z
  .object({
    motivo: z.string().min(3).max(300).meta({ example: "Capacidad de pago insuficiente según política vigente" }),
  })
  .meta({ id: "RechazarSolicitudRequest" });
