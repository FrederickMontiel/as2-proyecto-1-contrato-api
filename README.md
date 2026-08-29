# SGMC — Contratos de API (Proyecto 1 · Entregable E5)

Sistema de Gestión de Microcrédito — Crédito Vecino, S. A.

Contrato de API completo (Clientes, Solicitudes, Créditos, Pagos, Cierres,
Cartera en riesgo) diseñado a partir de la propuesta técnica en
`../docs/P1_Propuesta_Arquitectura_Microcredito.html`. Sigue el método del
taller Semana 6: el esquema Zod es la única fuente de verdad; `openapi.json`
y `openapi.yaml` son artefactos GENERADOS y no se editan a mano.

## Estructura

```
src/
├── contratos/
│   ├── comunes.ts      # Dinero, fechas, ids, ProblemDetails, EstadoCredito, TramoMora
│   ├── clientes.ts
│   ├── solicitudes.ts
│   ├── creditos.ts
│   ├── pagos.ts
│   ├── cierres.ts
│   └── cartera.ts
├── openapi.ts           # ensambla el documento OpenAPI 3.1
├── generar.ts            # escribe openapi.json y openapi.yaml
└── validar.ts             # valida el documento generado
docs/
└── adr/
    ├── ADR-001-arquitectura-hexagonal.md
    ├── ADR-002-representacion-dinero.md
    └── ADR-003-politicas-versionadas.md
```

## Uso

```bash
npm install
npm run generar     # Zod → openapi.json y openapi.yaml
npm run validar      # ¿es un documento OpenAPI 3.1 válido?
npm run typecheck     # TypeScript en modo strict
```

Este entregable (E5) diseña el contrato; no implementa servidor, base de
datos ni autenticación (fuera de alcance del Proyecto 1).

## Decisiones de negocio fijadas en el contrato

- El dinero nunca viaja como número JSON: siempre cadena decimal de 2
  decimales más la moneda (`Dinero`, ver ADR-002).
- Las fechas (`fechaPago`, `fechaCorte`, `fechaDesembolso`) las envía el
  cliente; el servidor nunca decide la fecha de una operación de negocio.
- Los errores usan `application/problem+json` conforme a RFC 9457
  (`ProblemDetails`).
- `POST /creditos/{id}/pagos` exige la cabecera `Idempotency-Key`: un
  reintento con la misma clave y el mismo cuerpo devuelve 200 (reproducido)
  en vez de cobrar dos veces.
- El tramo de mora (`mora_1`…`vencido`) es una clasificación DERIVADA de los
  días de atraso, no un estado persistido.
- `GET /cartera-riesgo` exige `fechaCorte` explícita (nunca "hoy" por
  omisión) y devuelve siempre lo dado por incobrable en el período junto al
  porcentaje.
