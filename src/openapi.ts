/**
 * openapi.ts — construye el documento OpenAPI 3.1 a partir de los esquemas Zod.
 *
 * Idea central del método (sección 2 de la práctica Semana 6): el contrato
 * NO se escribe dos veces. Los esquemas de src/contratos/ son la única
 * fuente de verdad; aquí solo se describen las operaciones (rutas, métodos,
 * cabeceras y códigos de estado) y se enlazan los esquemas ya definidos.
 *
 * Recursos cubiertos (sección 7.1 de la propuesta de arquitectura):
 * Clientes, Solicitudes, Créditos, Pagos, Cierres, Cartera en riesgo.
 */

import { z } from "zod";
import { Cliente, RegistrarClienteRequest } from "./contratos/clientes.ts";
import {
  AprobarSolicitudRequest,
  CrearSolicitudRequest,
  RechazarSolicitudRequest,
  Solicitud,
} from "./contratos/solicitudes.ts";
import { Credito, DesembolsarCreditoRequest, PlanAmortizacionResponse } from "./contratos/creditos.ts";
import { ListarPagosResponse, PagoRegistrado, RegistrarPagoRequest } from "./contratos/pagos.ts";
import { GenerarCierreDiarioRequest, GenerarCierreMensualRequest, CierreResponse } from "./contratos/cierres.ts";
import { CarteraEnRiesgoQuery, CarteraEnRiesgoResponse } from "./contratos/cartera.ts";
import { ClienteId, CreditoId, IdempotencyKey, Paginacion, ProblemDetails, SolicitudId } from "./contratos/comunes.ts";

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** OpenAPI 3.1 usa JSON Schema 2020-12: `examples` (arreglo), no `example`. */
function normalizar(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(normalizar);
  if (nodo && typeof nodo === "object") {
    const src = nodo as Record<string, unknown>;
    const salida: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(src)) {
      if (clave === "$schema" || clave === "$id") continue; // ruido dentro de components
      if (clave === "example") {
        salida.examples = [valor];
        continue;
      }
      salida[clave] = normalizar(valor);
    }
    return salida;
  }
  return nodo;
}

/** Convierte todos los esquemas con `id` registrados por Zod en components.schemas. */
function componentesDesdeZod(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    uri: (id) => `#/components/schemas/${id}`,
    target: "draft-2020-12",
  }) as { schemas: Record<string, unknown> };
  return normalizar(schemas) as Record<string, unknown>;
}

/**
 * Referencia a un esquema ya registrado.
 *
 * Recibe el ESQUEMA, no una cadena: un id mal escrito deja de ser posible
 * (falla al generar, no en el consumidor) y usar el esquema como valor
 * obliga a TypeScript a conservar el import correspondiente.
 */
const ref = (esquema: z.ZodType) => {
  const id = z.globalRegistry.get(esquema)?.id;
  if (!id) {
    throw new Error(
      "Se intento referenciar un esquema que no esta registrado con .meta({ id: \"...\" })."
    );
  }
  return { $ref: `#/components/schemas/${id}` };
};

/** Convierte un esquema de query/objeto en un arreglo de `parameters` OpenAPI (in: "query"). */
function parametrosDeQuery(esquema: z.ZodType, ubicacion: "query" | "path" = "query") {
  const json = normalizar(z.toJSONSchema(esquema, { io: "input" })) as {
    properties: Record<string, unknown>;
    required?: string[];
  };
  return Object.entries(json.properties).map(([nombre, propSchema]) => ({
    name: nombre,
    in: ubicacion,
    required: (json.required ?? []).includes(nombre),
    schema: propSchema,
  }));
}

/**
 * Respuesta de error uniforme (RFC 9457).
 *
 * Recibe un EJEMPLO propio de este código de estado: si se omitiera, un
 * servidor simulado generado desde el contrato (p. ej. Prism) caería al
 * ejemplo genérico de ProblemDetails para TODAS las respuestas de error.
 * Cada código de estado cuenta su propia historia; el ejemplo debe contarla.
 */
const problema = (descripcion: string, ejemplo: Record<string, unknown>) => ({
  description: descripcion,
  content: {
    "application/problem+json": {
      schema: ref(ProblemDetails),
      examples: { caso: { summary: descripcion, value: ejemplo } },
    },
  },
});

/* ------------------------------------------------------------------ */
/* Documento                                                           */
/* ------------------------------------------------------------------ */

export function construirDocumento() {
  const schemas = componentesDesdeZod();

  const esquemaClienteId = normalizar(z.toJSONSchema(ClienteId));
  const esquemaSolicitudId = normalizar(z.toJSONSchema(SolicitudId));
  const esquemaCreditoId = normalizar(z.toJSONSchema(CreditoId));
  const esquemaIdempotencyKey = normalizar(z.toJSONSchema(IdempotencyKey));

  const parametrosPaginacion = parametrosDeQuery(Paginacion);
  const parametrosCartera = parametrosDeQuery(CarteraEnRiesgoQuery);

  return {
    openapi: "3.1.0",
    info: {
      title: "SGMC · API de Crédito Vecino, S. A.",
      version: "1.0.0",
      description:
        "Contrato del Sistema de Gestión de Microcrédito (Proyecto 1, entregable E5). Los esquemas se generan desde Zod: el contrato y la validación en ejecución son el mismo artefacto. En esta entrega solo se DISEÑA el contrato; no se implementa servidor, base de datos ni autenticación.",
      contact: { name: "Análisis de Sistemas II (037) — UMG" },
      license: { name: "Uso académico" },
    },
    servers: [{ url: "https://api.creditovecino.gt/v1", description: "Producción (ficticia)" }],
    tags: [
      { name: "Clientes", description: "Identidad del sujeto de crédito" },
      { name: "Solicitudes", description: "Originación: solicitud, evaluación, aprobación/rechazo" },
      { name: "Créditos", description: "Desembolso, consulta y plan de amortización" },
      { name: "Cartera y cobros", description: "Registro de pagos y saldos" },
      { name: "Cierres e indicadores", description: "Cierres diarios/mensuales y cartera en riesgo" },
    ],
    paths: {
      /* ------------------------------- Clientes ------------------------------- */
      "/clientes": {
        post: {
          tags: ["Clientes"],
          operationId: "registrarCliente",
          summary: "Registra un cliente",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(RegistrarClienteRequest),
                examples: {
                  clienteNuevo: {
                    summary: "Registro de cliente",
                    value: {
                      nombre: "Ana Gabriela Pérez López",
                      identificacion: "2547 78912 0101",
                      contacto: { telefono: "+502 5555-1234", email: "ana.perez@correo.gt" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Cliente registrado",
              headers: { Location: { description: "URI del cliente creado", schema: { type: "string" } } },
              content: { "application/json": { schema: ref(Cliente) } },
            },
            "422": problema("El cuerpo es sintácticamente válido pero viola una regla del contrato o del dominio", {
              type: "https://api.creditovecino.gt/problemas/identificacion-duplicada",
              title: "Ya existe un cliente con esta identificación",
              status: 422,
              detail: "La identificación '2547 78912 0101' ya está registrada para el cliente 'CL-042'.",
              instance: "/clientes",
              traceId: "01J9Z4TC01",
            }),
          },
        },
      },
      "/clientes/{clienteId}": {
        get: {
          tags: ["Clientes"],
          operationId: "consultarCliente",
          summary: "Consulta un cliente por su identificador",
          parameters: [
            { name: "clienteId", in: "path", required: true, description: "Identificador del cliente", schema: esquemaClienteId },
          ],
          responses: {
            "200": {
              description: "Cliente encontrado",
              content: {
                "application/json": {
                  schema: ref(Cliente),
                  examples: {
                    cliente: {
                      summary: "Cliente registrado",
                      value: {
                        clienteId: "CL-042",
                        nombre: "Ana Gabriela Pérez López",
                        identificacion: "2547 78912 0101",
                        contacto: { telefono: "+502 5555-1234", email: "ana.perez@correo.gt" },
                        registradoEn: "2026-08-10T09:00:00-06:00",
                      },
                    },
                  },
                },
              },
            },
            "404": problema("El cliente no existe", {
              type: "https://api.creditovecino.gt/problemas/cliente-no-encontrado",
              title: "El cliente no existe",
              status: 404,
              detail: "No existe ningún cliente con el identificador 'CL-999'.",
              instance: "/clientes/CL-999",
              traceId: "01J9Z4TC10",
            }),
          },
        },
      },

      /* ------------------------------ Solicitudes ------------------------------ */
      "/solicitudes": {
        post: {
          tags: ["Solicitudes"],
          operationId: "crearSolicitud",
          summary: "Crea una solicitud de crédito",
          description: "El monto solicitado debe estar entre Q1,000.00 y Q25,000.00, con plazo de 3 a 24 meses.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(CrearSolicitudRequest),
                examples: {
                  solicitudNueva: {
                    summary: "Solicitud de referencia",
                    value: {
                      clienteId: "CL-042",
                      montoSolicitado: { valor: "8000.00", moneda: "GTQ" },
                      plazoMeses: 12,
                      proposito: "Capital de trabajo para negocio de abarrotes",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Solicitud creada",
              headers: { Location: { description: "URI de la solicitud creada", schema: { type: "string" } } },
              content: { "application/json": { schema: ref(Solicitud) } },
            },
            "404": problema("El cliente referido no existe", {
              type: "https://api.creditovecino.gt/problemas/cliente-no-encontrado",
              title: "El cliente no existe",
              status: 404,
              detail: "No existe ningún cliente con el identificador 'CL-999'.",
              instance: "/solicitudes",
              traceId: "01J9Z4TC20",
            }),
            "422": problema("El monto o el plazo están fuera del rango permitido por la política de producto", {
              type: "https://api.creditovecino.gt/problemas/fuera-de-rango-producto",
              title: "Monto o plazo fuera del rango del producto",
              status: 422,
              detail: "El monto solicitado 'Q30,000.00' excede el máximo de Q25,000.00 para microcrédito.",
              instance: "/solicitudes",
              traceId: "01J9Z4TC21",
            }),
          },
        },
      },
      "/solicitudes/{solicitudId}": {
        get: {
          tags: ["Solicitudes"],
          operationId: "consultarSolicitud",
          summary: "Consulta una solicitud por su identificador",
          parameters: [
            { name: "solicitudId", in: "path", required: true, description: "Identificador de la solicitud", schema: esquemaSolicitudId },
          ],
          responses: {
            "200": {
              description: "Solicitud encontrada",
              content: {
                "application/json": {
                  schema: ref(Solicitud),
                  examples: {
                    solicitud: {
                      summary: "Solicitud aprobada",
                      value: {
                        solicitudId: "SO-118",
                        clienteId: "CL-042",
                        montoSolicitado: { valor: "8000.00", moneda: "GTQ" },
                        plazoMeses: 12,
                        estado: "aprobado",
                        creadoEn: "2026-08-15T10:30:00-06:00",
                        creditoId: "C-004",
                      },
                    },
                  },
                },
              },
            },
            "404": problema("La solicitud no existe", {
              type: "https://api.creditovecino.gt/problemas/solicitud-no-encontrada",
              title: "La solicitud no existe",
              status: 404,
              detail: "No existe ninguna solicitud con el identificador 'SO-999'.",
              instance: "/solicitudes/SO-999",
              traceId: "01J9Z4TC30",
            }),
          },
        },
      },
      "/solicitudes/{solicitudId}/aprobacion": {
        post: {
          tags: ["Solicitudes"],
          operationId: "aprobarSolicitud",
          summary: "Aprueba una solicitud de crédito",
          description: "Decisión del Comité de Crédito. Requiere que la solicitud esté en estado 'solicitado' o 'en_evaluacion'.",
          parameters: [
            { name: "solicitudId", in: "path", required: true, description: "Identificador de la solicitud", schema: esquemaSolicitudId },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(AprobarSolicitudRequest),
                examples: { aprobacion: { summary: "Aprobación con tasa de referencia", value: { tasaAprobadaAnual: 0.36 } } },
              },
            },
          },
          responses: {
            "200": { description: "Solicitud aprobada", content: { "application/json": { schema: ref(Solicitud) } } },
            "404": problema("La solicitud no existe", {
              type: "https://api.creditovecino.gt/problemas/solicitud-no-encontrada",
              title: "La solicitud no existe",
              status: 404,
              detail: "No existe ninguna solicitud con el identificador 'SO-999'.",
              instance: "/solicitudes/SO-999/aprobacion",
              traceId: "01J9Z4TC40",
            }),
            "409": problema("La solicitud ya fue decidida (aprobada o rechazada) previamente", {
              type: "https://api.creditovecino.gt/problemas/solicitud-ya-decidida",
              title: "La solicitud ya fue decidida",
              status: 409,
              detail: "La solicitud 'SO-118' ya se encuentra en estado 'rechazado' y no admite una nueva decisión.",
              instance: "/solicitudes/SO-118/aprobacion",
              traceId: "01J9Z4TC41",
            }),
          },
        },
      },
      "/solicitudes/{solicitudId}/rechazo": {
        post: {
          tags: ["Solicitudes"],
          operationId: "rechazarSolicitud",
          summary: "Rechaza una solicitud de crédito",
          parameters: [
            { name: "solicitudId", in: "path", required: true, description: "Identificador de la solicitud", schema: esquemaSolicitudId },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(RechazarSolicitudRequest),
                examples: {
                  rechazo: { summary: "Rechazo con motivo", value: { motivo: "Capacidad de pago insuficiente según política vigente" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Solicitud rechazada", content: { "application/json": { schema: ref(Solicitud) } } },
            "404": problema("La solicitud no existe", {
              type: "https://api.creditovecino.gt/problemas/solicitud-no-encontrada",
              title: "La solicitud no existe",
              status: 404,
              detail: "No existe ninguna solicitud con el identificador 'SO-999'.",
              instance: "/solicitudes/SO-999/rechazo",
              traceId: "01J9Z4TC50",
            }),
            "409": problema("La solicitud ya fue decidida (aprobada o rechazada) previamente", {
              type: "https://api.creditovecino.gt/problemas/solicitud-ya-decidida",
              title: "La solicitud ya fue decidida",
              status: 409,
              detail: "La solicitud 'SO-118' ya se encuentra en estado 'aprobado' y no admite una nueva decisión.",
              instance: "/solicitudes/SO-118/rechazo",
              traceId: "01J9Z4TC51",
            }),
          },
        },
      },

      /* -------------------------------- Créditos -------------------------------- */
      "/creditos/{creditoId}": {
        get: {
          tags: ["Créditos"],
          operationId: "consultarCredito",
          summary: "Consulta un crédito por su identificador",
          parameters: [
            { name: "creditoId", in: "path", required: true, description: "Identificador del crédito", schema: esquemaCreditoId },
          ],
          responses: {
            "200": {
              description: "Crédito encontrado",
              content: {
                "application/json": {
                  schema: ref(Credito),
                  examples: {
                    credito: {
                      summary: "Crédito vigente",
                      value: {
                        creditoId: "C-004",
                        clienteId: "CL-042",
                        solicitudId: "SO-118",
                        estado: "vigente",
                        tramoMora: "ninguno",
                        diasAtraso: 0,
                        montoOriginal: { valor: "8000.00", moneda: "GTQ" },
                        saldoCapital: { valor: "6500.24", moneda: "GTQ" },
                        tasaAprobadaAnual: 0.36,
                        plazoMeses: 12,
                        fechaDesembolso: "2026-08-22",
                        creadoEn: "2026-08-15T10:30:00-06:00",
                      },
                    },
                  },
                },
              },
            },
            "404": problema("El crédito no existe", {
              type: "https://api.creditovecino.gt/problemas/credito-no-encontrado",
              title: "El crédito no existe",
              status: 404,
              detail: "No existe ningún crédito con el identificador 'C-999'.",
              instance: "/creditos/C-999",
              traceId: "01J9Z4TC60",
            }),
          },
        },
      },
      "/creditos/{creditoId}/desembolsos": {
        post: {
          tags: ["Créditos"],
          operationId: "desembolsarCredito",
          summary: "Registra el desembolso de una solicitud aprobada y genera el plan de amortización",
          description:
            "Un crédito solo puede desembolsarse una vez: reintentar el desembolso de un crédito ya VIGENTE devuelve 409, no un desembolso duplicado.",
          parameters: [
            { name: "creditoId", in: "path", required: true, description: "Identificador del crédito", schema: esquemaCreditoId },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(DesembolsarCreditoRequest),
                examples: { desembolso: { summary: "Desembolso", value: { fechaDesembolso: "2026-08-22", cuentaDestino: "CTA-00981245" } } },
              },
            },
          },
          responses: {
            "201": { description: "Crédito desembolsado", content: { "application/json": { schema: ref(Credito) } } },
            "404": problema("El crédito no existe", {
              type: "https://api.creditovecino.gt/problemas/credito-no-encontrado",
              title: "El crédito no existe",
              status: 404,
              detail: "No existe ningún crédito con el identificador 'C-999'.",
              instance: "/creditos/C-999/desembolsos",
              traceId: "01J9Z4TC70",
            }),
            "409": problema("El crédito ya fue desembolsado o su estado no admite desembolso", {
              type: "https://api.creditovecino.gt/problemas/estado-no-admite-desembolso",
              title: "El crédito no admite desembolso en su estado actual",
              status: 409,
              detail: "El crédito 'C-004' ya se encuentra en estado 'vigente'.",
              instance: "/creditos/C-004/desembolsos",
              traceId: "01J9Z4TC71",
            }),
          },
        },
      },
      "/creditos/{creditoId}/plan-amortizacion": {
        get: {
          tags: ["Créditos"],
          operationId: "consultarPlanAmortizacion",
          summary: "Consulta el plan de amortización de un crédito desembolsado",
          parameters: [
            { name: "creditoId", in: "path", required: true, description: "Identificador del crédito", schema: esquemaCreditoId },
          ],
          responses: {
            "200": {
              description: "Plan de amortización",
              content: {
                "application/json": {
                  schema: ref(PlanAmortizacionResponse),
                  examples: {
                    plan: {
                      summary: "Primeras cuotas de un plan a 12 meses (método francés)",
                      value: {
                        creditoId: "C-004",
                        capital: { valor: "8000.00", moneda: "GTQ" },
                        tasaMensual: 0.03,
                        numeroCuotas: 12,
                        cuotas: [
                          {
                            numero: 1,
                            vencimiento: "2026-09-22",
                            saldoInicial: { valor: "8000.00", moneda: "GTQ" },
                            cuota: { valor: "804.16", moneda: "GTQ" },
                            interes: { valor: "240.00", moneda: "GTQ" },
                            amortizacion: { valor: "564.16", moneda: "GTQ" },
                            saldoFinal: { valor: "7435.84", moneda: "GTQ" },
                            estado: "pendiente",
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
            "404": problema("El crédito no existe", {
              type: "https://api.creditovecino.gt/problemas/credito-no-encontrado",
              title: "El crédito no existe",
              status: 404,
              detail: "No existe ningún crédito con el identificador 'C-999'.",
              instance: "/creditos/C-999/plan-amortizacion",
              traceId: "01J9Z4TC80",
            }),
            "422": problema("El crédito aún no tiene plan de amortización porque no ha sido desembolsado", {
              type: "https://api.creditovecino.gt/problemas/credito-sin-plan",
              title: "El crédito no tiene plan de amortización",
              status: 422,
              detail: "El crédito 'C-010' está en estado 'aprobado': aún no fue desembolsado.",
              instance: "/creditos/C-010/plan-amortizacion",
              traceId: "01J9Z4TC81",
            }),
          },
        },
      },
      "/creditos/{creditoId}/pagos": {
        post: {
          tags: ["Cartera y cobros"],
          operationId: "registrarPago",
          summary: "Registra un pago sobre un crédito",
          description:
            "Aplica el pago en el orden de prelación (gastos → interés moratorio → interés corriente → capital) y devuelve el desglose. Operación NO idempotente por método: la idempotencia se obtiene con la cabecera Idempotency-Key.",
          parameters: [
            { name: "creditoId", in: "path", required: true, description: "Identificador del crédito", schema: esquemaCreditoId },
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              description:
                "Clave generada por el cliente. Si se reintenta el mismo pago con la misma clave y el mismo cuerpo, se devuelve la respuesta original (200) sin volver a cobrar.",
              schema: esquemaIdempotencyKey,
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(RegistrarPagoRequest),
                examples: {
                  pagoExacto: {
                    summary: "Pago exacto de la cuota 2 vencida (caso de referencia)",
                    value: {
                      monto: { valor: "1011.88", moneda: "GTQ" },
                      fechaPago: "2026-08-22",
                      medio: "agente_bancario",
                      referencia: "BOL-88213",
                    },
                  },
                  pagoParcial: {
                    summary: "Pago de menos (caso de referencia)",
                    value: { monto: { valor: "500.00", moneda: "GTQ" }, fechaPago: "2026-08-22", medio: "efectivo" },
                  },
                  pagoDeMas: {
                    summary: "Pago de más (caso de referencia)",
                    value: { monto: { valor: "3000.00", moneda: "GTQ" }, fechaPago: "2026-08-22", medio: "transferencia" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Pago registrado por primera vez",
              headers: { Location: { description: "URI del pago creado", schema: { type: "string" } } },
              content: {
                "application/json": {
                  schema: ref(PagoRegistrado),
                  examples: {
                    pagoNuevo: {
                      summary: "Pago exacto de la cuota 2 vencida (caso de referencia)",
                      value: {
                        pagoId: "PG-2026-000731",
                        creditoId: "C-004",
                        recibidoEn: "2026-08-22T09:15:00-06:00",
                        montoRecibido: { valor: "1011.88", moneda: "GTQ" },
                        aplicacion: {
                          gastos: "0.00",
                          interesMoratorio: "7.26",
                          interesCorriente: "278.86",
                          capital: "725.76",
                          excedente: "0.00",
                        },
                        saldoCapitalDespues: { valor: "6500.24", moneda: "GTQ" },
                        estadoCredito: "vigente",
                        tramoMora: "ninguno",
                        diasAtraso: 0,
                        reproducido: false,
                      },
                    },
                  },
                },
              },
            },
            "200": {
              description:
                "Reintento con la misma clave y el mismo contenido: se reproduce la respuesta original (reproducido = true). No se cobró de nuevo.",
              content: {
                "application/json": {
                  schema: ref(PagoRegistrado),
                  examples: {
                    pagoReproducido: {
                      summary: "Reintento con la misma Idempotency-Key",
                      value: {
                        pagoId: "PG-2026-000731",
                        creditoId: "C-004",
                        recibidoEn: "2026-08-22T09:15:00-06:00",
                        montoRecibido: { valor: "1011.88", moneda: "GTQ" },
                        aplicacion: {
                          gastos: "0.00",
                          interesMoratorio: "7.26",
                          interesCorriente: "278.86",
                          capital: "725.76",
                          excedente: "0.00",
                        },
                        saldoCapitalDespues: { valor: "6500.24", moneda: "GTQ" },
                        estadoCredito: "vigente",
                        tramoMora: "ninguno",
                        diasAtraso: 0,
                        reproducido: true,
                      },
                    },
                  },
                },
              },
            },
            "404": problema("El crédito no existe", {
              type: "https://api.creditovecino.gt/problemas/credito-no-encontrado",
              title: "El crédito no existe",
              status: 404,
              detail: "No existe ningún crédito con el identificador 'C-999'.",
              instance: "/creditos/C-999/pagos",
              traceId: "01J9Z4T900",
            }),
            "409": problema(
              "Conflicto: la clave de idempotencia se reutilizó con un contenido distinto, o el estado del crédito no admite pagos (p. ej. 'solicitado').",
              {
                type: "https://api.creditovecino.gt/problemas/clave-idempotencia-reutilizada",
                title: "Clave de idempotencia reutilizada con otro contenido",
                status: 409,
                detail: "La clave 5b0b9e2e… se usó antes con un monto distinto.",
                instance: "/creditos/C-004/pagos",
                traceId: "01J9Z4T8Q2",
              }
            ),
            "422": problema("El cuerpo es sintácticamente válido pero viola una regla del contrato o del dominio", {
              type: "https://api.creditovecino.gt/problemas/estado-no-admite-pago",
              title: "El crédito no admite pagos en su estado actual",
              status: 422,
              detail: "El crédito 'C-010' está en estado 'solicitado': aún no fue desembolsado y no puede recibir pagos.",
              instance: "/creditos/C-010/pagos",
              traceId: "01J9Z4T9K1",
            }),
            "429": problema("Demasiadas solicitudes", {
              type: "https://api.creditovecino.gt/problemas/limite-excedido",
              title: "Demasiadas solicitudes en poco tiempo",
              status: 429,
              detail: "Se superó el límite de 60 solicitudes por minuto para este cliente. Reintente tras 'Retry-After'.",
              instance: "/creditos/C-004/pagos",
              traceId: "01J9Z4T9X7",
            }),
            "500": problema("Error no previsto del servidor", {
              type: "https://api.creditovecino.gt/problemas/error-servidor",
              title: "Error no previsto del servidor",
              status: 500,
              detail: "Ocurrió un error inesperado al procesar el pago. Consulte el traceId con soporte.",
              instance: "/creditos/C-004/pagos",
              traceId: "01J9Z4TA02",
            }),
          },
        },
        get: {
          tags: ["Cartera y cobros"],
          operationId: "consultarPagos",
          summary: "Lista los pagos registrados de un crédito",
          parameters: [
            { name: "creditoId", in: "path", required: true, description: "Identificador del crédito", schema: esquemaCreditoId },
            ...parametrosPaginacion,
          ],
          responses: {
            "200": {
              description: "Pagos del crédito",
              content: {
                "application/json": {
                  schema: ref(ListarPagosResponse),
                  examples: {
                    pagos: {
                      summary: "Historial con un pago registrado",
                      value: {
                        creditoId: "C-004",
                        pagos: [
                          {
                            pagoId: "PG-2026-000731",
                            creditoId: "C-004",
                            recibidoEn: "2026-08-22T09:15:00-06:00",
                            montoRecibido: { valor: "1011.88", moneda: "GTQ" },
                            aplicacion: {
                              gastos: "0.00",
                              interesMoratorio: "7.26",
                              interesCorriente: "278.86",
                              capital: "725.76",
                              excedente: "0.00",
                            },
                            saldoCapitalDespues: { valor: "6500.24", moneda: "GTQ" },
                            estadoCredito: "vigente",
                            tramoMora: "ninguno",
                            diasAtraso: 0,
                            reproducido: false,
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
            "404": problema("El crédito no existe", {
              type: "https://api.creditovecino.gt/problemas/credito-no-encontrado",
              title: "El crédito no existe",
              status: 404,
              detail: "No existe ningún crédito con el identificador 'C-999'.",
              instance: "/creditos/C-999/pagos",
              traceId: "01J9Z4TC90",
            }),
          },
        },
      },

      /* --------------------------------- Cierres --------------------------------- */
      "/cierres/diarios": {
        post: {
          tags: ["Cierres e indicadores"],
          operationId: "generarCierreDiario",
          summary: "Genera (o reproduce) el cierre diario de una fecha de corte",
          description: "Operación idempotente por fechaCorte: generar el cierre de una fecha ya cerrada devuelve el cierre existente, no un duplicado.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(GenerarCierreDiarioRequest),
                examples: { cierre: { summary: "Cierre diario", value: { fechaCorte: "2026-08-22" } } },
              },
            },
          },
          responses: {
            "201": {
              description: "Cierre generado por primera vez",
              content: {
                "application/json": {
                  schema: ref(CierreResponse),
                  examples: {
                    cierreNuevo: {
                      summary: "Cierre diario generado",
                      value: {
                        cierreId: "CI-2026-08-22-D",
                        tipo: "diario",
                        fechaCorte: "2026-08-22",
                        carteraActiva: { valor: "800000.00", moneda: "GTQ" },
                        saldoEnRiesgo: { valor: "56000.00", moneda: "GTQ" },
                        dadoPorIncobrableEnElPeriodo: { valor: "0.00", moneda: "GTQ" },
                        generadoEn: "2026-08-22T23:59:00-06:00",
                        reproducido: false,
                      },
                    },
                  },
                },
              },
            },
            "200": {
              description: "El cierre de esta fecha ya existía: se reproduce (reproducido = true), sin recalcular.",
              content: {
                "application/json": {
                  schema: ref(CierreResponse),
                  examples: {
                    cierreReproducido: {
                      summary: "Reintento del cierre diario",
                      value: {
                        cierreId: "CI-2026-08-22-D",
                        tipo: "diario",
                        fechaCorte: "2026-08-22",
                        carteraActiva: { valor: "800000.00", moneda: "GTQ" },
                        saldoEnRiesgo: { valor: "56000.00", moneda: "GTQ" },
                        dadoPorIncobrableEnElPeriodo: { valor: "0.00", moneda: "GTQ" },
                        generadoEn: "2026-08-22T23:59:00-06:00",
                        reproducido: true,
                      },
                    },
                  },
                },
              },
            },
            "422": problema("La fecha de corte es futura o anterior a la puesta en marcha del Sistema", {
              type: "https://api.creditovecino.gt/problemas/fecha-fuera-de-rango",
              title: "Fecha de corte fuera del rango permitido",
              status: 422,
              detail: "La fecha de corte no puede ser posterior a la fecha del día.",
              instance: "/cierres/diarios",
              traceId: "01J9Z4TCA0",
            }),
          },
        },
      },
      "/cierres/mensuales": {
        post: {
          tags: ["Cierres e indicadores"],
          operationId: "generarCierreMensual",
          summary: "Genera (o reproduce) el cierre mensual de un mes de corte",
          description: "Operación idempotente por mesCorte: generar el cierre de un mes ya cerrado devuelve el cierre existente, no un duplicado.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref(GenerarCierreMensualRequest),
                examples: { cierre: { summary: "Cierre mensual", value: { mesCorte: "2026-08" } } },
              },
            },
          },
          responses: {
            "201": {
              description: "Cierre generado por primera vez",
              content: {
                "application/json": {
                  schema: ref(CierreResponse),
                  examples: {
                    cierreNuevo: {
                      summary: "Cierre mensual generado",
                      value: {
                        cierreId: "CI-2026-08-M",
                        tipo: "mensual",
                        fechaCorte: "2026-08-31",
                        carteraActiva: { valor: "800000.00", moneda: "GTQ" },
                        saldoEnRiesgo: { valor: "56000.00", moneda: "GTQ" },
                        dadoPorIncobrableEnElPeriodo: { valor: "8000.00", moneda: "GTQ" },
                        generadoEn: "2026-08-31T23:59:00-06:00",
                        reproducido: false,
                      },
                    },
                  },
                },
              },
            },
            "200": {
              description: "El cierre de este mes ya existía: se reproduce (reproducido = true), sin recalcular.",
              content: {
                "application/json": {
                  schema: ref(CierreResponse),
                  examples: {
                    cierreReproducido: {
                      summary: "Reintento del cierre mensual",
                      value: {
                        cierreId: "CI-2026-08-M",
                        tipo: "mensual",
                        fechaCorte: "2026-08-31",
                        carteraActiva: { valor: "800000.00", moneda: "GTQ" },
                        saldoEnRiesgo: { valor: "56000.00", moneda: "GTQ" },
                        dadoPorIncobrableEnElPeriodo: { valor: "8000.00", moneda: "GTQ" },
                        generadoEn: "2026-08-31T23:59:00-06:00",
                        reproducido: true,
                      },
                    },
                  },
                },
              },
            },
            "422": problema("El mes de corte es futuro o el mes aún no ha concluido", {
              type: "https://api.creditovecino.gt/problemas/mes-fuera-de-rango",
              title: "Mes de corte fuera del rango permitido",
              status: 422,
              detail: "El mes de corte '2026-09' aún no ha concluido.",
              instance: "/cierres/mensuales",
              traceId: "01J9Z4TCA1",
            }),
          },
        },
      },

      /* ---------------------------- Cartera en riesgo ---------------------------- */
      "/cartera-riesgo": {
        get: {
          tags: ["Cierres e indicadores"],
          operationId: "consultarCarteraEnRiesgo",
          summary: "Consulta el indicador de cartera en riesgo a una fecha de corte",
          description:
            "Operación segura e idempotente. Devuelve siempre, junto al porcentaje, lo dado por incobrable en el período: reportar solo el indicador es engañoso.",
          // Los parámetros de consulta se DERIVAN del esquema Zod: si mañana se
          // agrega un filtro al esquema, aparece solo en el contrato.
          parameters: parametrosCartera,
          responses: {
            "200": {
              description: "Indicador calculado",
              content: {
                "application/json": {
                  schema: ref(CarteraEnRiesgoResponse),
                  examples: {
                    casoDeReferencia: {
                      summary: "Caso de referencia (7.00 %)",
                      value: {
                        fechaCorte: "2026-08-22",
                        carteraActiva: { valor: "800000.00", moneda: "GTQ" },
                        saldoEnRiesgo: { valor: "56000.00", moneda: "GTQ" },
                        porcentajeEnRiesgo: 0.07,
                        dadoPorIncobrableEnElPeriodo: { valor: "0.00", moneda: "GTQ" },
                        porTramo: [
                          { tramo: "mora_2", creditos: 1, saldoCapital: { valor: "24000.00", moneda: "GTQ" } },
                          { tramo: "mora_3", creditos: 1, saldoCapital: { valor: "18000.00", moneda: "GTQ" } },
                          { tramo: "vencido", creditos: 1, saldoCapital: { valor: "8000.00", moneda: "GTQ" } },
                        ],
                      },
                    },
                    trasIncobrable: {
                      summary: "Tras dar C-005 por incobrable (6.06 %)",
                      value: {
                        fechaCorte: "2026-08-23",
                        carteraActiva: { valor: "792000.00", moneda: "GTQ" },
                        saldoEnRiesgo: { valor: "48000.00", moneda: "GTQ" },
                        porcentajeEnRiesgo: 0.0606,
                        dadoPorIncobrableEnElPeriodo: { valor: "8000.00", moneda: "GTQ" },
                        porTramo: [{ tramo: "mora_2", creditos: 1, saldoCapital: { valor: "24000.00", moneda: "GTQ" } }],
                      },
                    },
                  },
                },
              },
            },
            "400": problema("Parámetros de consulta inválidos", {
              type: "https://api.creditovecino.gt/problemas/validacion",
              title: "Parámetros de consulta inválidos",
              status: 400,
              detail: "El parámetro 'fechaCorte' no cumple el formato AAAA-MM-DD.",
              instance: "/cartera-riesgo",
              traceId: "01J9Z4TB14",
              errores: [{ campo: "fechaCorte", mensaje: "Formato esperado: AAAA-MM-DD, p. ej. '2026-08-22'." }],
            }),
            "422": problema("Fecha de corte fuera del rango permitido", {
              type: "https://api.creditovecino.gt/problemas/fecha-fuera-de-rango",
              title: "Fecha de corte fuera del rango permitido",
              status: 422,
              detail: "La fecha de corte no puede ser posterior a la fecha del día ni anterior a la puesta en marcha del Sistema (01/01/2025).",
              instance: "/cartera-riesgo",
              traceId: "01J9Z4TBZ3",
            }),
          },
        },
      },
    },
    components: { schemas },
  };
}
