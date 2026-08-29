/**
 * clientes.ts — contrato del recurso Cliente.
 *
 * Casos de uso: RegistrarCliente y ConsultarCliente (sección 3.1 y 3.2 del
 * modelo de dominio). Identidad del sujeto de crédito; no contiene reglas
 * financieras.
 */

import { z } from "zod";
import { ClienteId, InstanteISO } from "./comunes.ts";

export const Contacto = z
  .object({
    telefono: z.string().min(8).max(20).meta({ example: "+502 5555-1234" }),
    email: z.email().optional().meta({ example: "cliente@correo.gt" }),
    direccion: z.string().max(200).optional().meta({ example: "0 avenida 0-00, zona 1, Guatemala" }),
  })
  .meta({ id: "Contacto" });

export const RegistrarClienteRequest = z
  .object({
    nombre: z.string().min(2).max(120).meta({ example: "Ana Gabriela Pérez López" }),
    identificacion: z
      .string()
      .min(5)
      .max(20)
      .meta({ description: "Documento Personal de Identificación (DPI) u otro identificador oficial", example: "2547 78912 0101" }),
    contacto: Contacto,
  })
  .meta({ id: "RegistrarClienteRequest" });

export const Cliente = z
  .object({
    clienteId: ClienteId,
    nombre: z.string(),
    identificacion: z.string(),
    contacto: Contacto,
    registradoEn: InstanteISO,
  })
  .meta({ id: "Cliente" });
