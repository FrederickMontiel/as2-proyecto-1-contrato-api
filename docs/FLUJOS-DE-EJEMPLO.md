# Flujos de ejemplo — contrato del SGMC

Secuencias end-to-end para probar el contrato contra el servidor simulado
(Prism). Cada paso indica la petición equivalente de la colección de Postman
(`pruebas/postman/SGMC-Final.postman_collection.json`) y el `curl` directo.

Antes de empezar:

```bash
cd final
npm install
npm run generar
npx @stoplight/prism-cli mock openapi.yaml
```

Todas las peticiones que forzán un código de error específico necesitan la
cabecera `Prefer: code=XXX` (ver `pruebas/postman/LEEME.md`); los `curl` de
abajo omiten esa cabecera porque siguen el camino feliz.

---

## Flujo 1 — Originación completa: de cliente a crédito vigente

Camino feliz de principio a fin: registrar cliente → solicitar → aprobar →
desembolsar → consultar plan.

**1. Registrar cliente** — `POST /clientes`
```bash
curl -X POST http://127.0.0.1:4010/clientes \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana Gabriela Pérez López",
    "identificacion": "2547 78912 0101",
    "contacto": { "telefono": "+502 5555-1234", "email": "ana.perez@correo.gt" }
  }'
```
→ 201, guarde el `clienteId` de la respuesta (ej. `CL-042`).

**2. Crear solicitud** — `POST /solicitudes`
```bash
curl -X POST http://127.0.0.1:4010/solicitudes \
  -H "Content-Type: application/json" \
  -d '{
    "clienteId": "CL-042",
    "montoSolicitado": { "valor": "8000.00", "moneda": "GTQ" },
    "plazoMeses": 12,
    "proposito": "Capital de trabajo para negocio de abarrotes"
  }'
```
→ 201, guarde el `solicitudId` (ej. `SO-118`).

**3. Comité aprueba** — `POST /solicitudes/{id}/aprobacion`
```bash
curl -X POST http://127.0.0.1:4010/solicitudes/SO-118/aprobacion \
  -H "Content-Type: application/json" \
  -d '{ "tasaAprobadaAnual": 0.36, "comentario": "Aprobado con tasa de referencia" }'
```
→ 200, la solicitud pasa a `aprobado` y expone un `creditoId`.

**4. Desembolsar** — `POST /creditos/{id}/desembolsos`
```bash
curl -X POST http://127.0.0.1:4010/creditos/C-004/desembolsos \
  -H "Content-Type: application/json" \
  -d '{ "fechaDesembolso": "2026-08-22", "cuentaDestino": "CTA-00981245" }'
```
→ 201, el crédito pasa a `vigente` y se genera el plan de amortización.

**5. Consultar el plan** — `GET /creditos/{id}/plan-amortizacion`
```bash
curl http://127.0.0.1:4010/creditos/C-004/plan-amortizacion
```
→ 200, arreglo de cuotas con la última cuota ajustada a saldo final Q0.00.

**Qué demuestra este flujo:** que ningún endpoint decide una fecha por su
cuenta (todas las fechas las envía el cliente) y que el `creditoId` nace de
la aprobación, no de la creación de la solicitud — la solicitud y el crédito
son recursos distintos con distinto ciclo de vida (sección 3.7 de la
propuesta de arquitectura).

---

## Flujo 2 — Registrar un pago y no cobrarlo dos veces (idempotencia)

Reproduce el caso de referencia: cuota 2 vencida 15 días, pago exacto de
Q1,011.88 (mora Q7.26 + interés corriente Q278.86 + capital Q725.76).

**1. Primer pago** — `POST /creditos/{id}/pagos` con una `Idempotency-Key` nueva
```bash
curl -X POST http://127.0.0.1:4010/creditos/C-004/pagos \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 5b0b9e2e-6a1f-4a5c-9c1e-0d6d1a1f0b3a" \
  -d '{
    "monto": { "valor": "1011.88", "moneda": "GTQ" },
    "fechaPago": "2026-08-22",
    "medio": "agente_bancario",
    "referencia": "BOL-88213"
  }'
```
→ 201, `reproducido: false`, desglose completo en orden de prelación.

**2. Reintento — misma clave, mismo cuerpo (ej. el asesor perdió la señal y reenvía)**
```bash
curl -X POST http://127.0.0.1:4010/creditos/C-004/pagos \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 5b0b9e2e-6a1f-4a5c-9c1e-0d6d1a1f0b3a" \
  -d '{
    "monto": { "valor": "1011.88", "moneda": "GTQ" },
    "fechaPago": "2026-08-22",
    "medio": "agente_bancario",
    "referencia": "BOL-88213"
  }'
```
→ 200 (no 201), `reproducido: true`. El cliente no fue cobrado dos veces.

**3. Misma clave, cuerpo distinto (error del cliente al reintentar)**
```bash
curl -X POST http://127.0.0.1:4010/creditos/C-004/pagos \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 5b0b9e2e-6a1f-4a5c-9c1e-0d6d1a1f0b3a" \
  -d '{ "monto": { "valor": "500.00", "moneda": "GTQ" }, "fechaPago": "2026-08-22", "medio": "efectivo" }'
```
→ 409, `clave-idempotencia-reutilizada` — la clave ya se usó con otro monto.

**4. Consultar el historial** — `GET /creditos/{id}/pagos`
```bash
curl "http://127.0.0.1:4010/creditos/C-004/pagos?limite=50"
```
→ 200, un solo pago en la lista (el reintento del paso 2 no generó un
segundo registro).

**Qué demuestra este flujo:** la regla 4 del contrato (sección 3 del PDF de
la práctica) — reintentar no cobra dos veces — y por qué el desglose
(`aplicacion`) es obligatorio: sin él, nadie puede explicarle al cliente por
qué su saldo bajó Q725.76 y no Q1,011.88.

---

## Flujo 3 — Pago de más y política de adelanto

```bash
curl -X POST http://127.0.0.1:4010/creditos/C-004/pagos \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7c1c0f3f-8b2f-4b6d-ad2f-1e7e2b2f0c4b" \
  -d '{
    "monto": { "valor": "3000.00", "moneda": "GTQ" },
    "fechaPago": "2026-08-22",
    "medio": "transferencia"
  }'
```
→ 201. `aplicacion.excedente` debe ser Q1,988.12 (Q3,000.00 − Q1,011.88 de lo
vencido), aplicado como adelanto a capital según la política institucional
(sección 2.5 de la propuesta de arquitectura).

---

## Flujo 4 — Cierre diario y cartera en riesgo (idempotencia por fecha, no por cabecera)

**1. Generar el cierre del día** — `POST /cierres/diarios`
```bash
curl -X POST http://127.0.0.1:4010/cierres/diarios -H "Content-Type: application/json" \
  -d '{ "fechaCorte": "2026-08-22" }'
```
→ 201, `reproducido: false`.

**2. Repetir el mismo cierre** (ej. el proceso de cierre se reintentó tras un timeout)
```bash
curl -X POST http://127.0.0.1:4010/cierres/diarios -H "Content-Type: application/json" \
  -d '{ "fechaCorte": "2026-08-22" }'
```
→ 200, `reproducido: true` — el cierre no se genera dos veces, la fecha
misma es la clave de idempotencia (no necesita `Idempotency-Key`).

**3. Consultar cartera en riesgo a esa fecha** — `GET /cartera-riesgo`
```bash
curl "http://127.0.0.1:4010/cartera-riesgo?fechaCorte=2026-08-22&incluirReestructurados=true"
```
→ 200. Debe traer siempre `dadoPorIncobrableEnElPeriodo` junto al
`porcentajeEnRiesgo` (sección 2.6 / caso de referencia 7.00 %) — reportar
solo el porcentaje sería reportar una ilusión si ese mismo período se dieron
créditos de baja.

**Qué demuestra este flujo:** por qué la fecha de corte es un parámetro
obligatorio del cliente y nunca "hoy" por defecto — una auditoría debe poder
repetir exactamente la misma consulta en cualquier momento y obtener el
mismo resultado.

---

## Referencia rápida: quién decide cada dato

| Dato | ¿Quién lo decide? | Por qué |
|---|---|---|
| `fechaPago`, `fechaCorte`, `fechaDesembolso` | El cliente (parámetro) | El puerto Reloj del dominio nunca se usa para operaciones de negocio (sección 2.1); un asesor que cobra en campo y sincroniza después debe poder declarar la fecha real. |
| `Idempotency-Key` en `/pagos` | El cliente (cabecera, UUID v4) | Reintentar no debe cobrar dos veces; el servidor no puede inventar esa clave. |
| `tramoMora` | El servidor (derivado) | Es una clasificación calculada de los días de atraso, nunca un valor que el cliente envíe. |
| `reproducido` en pagos y cierres | El servidor (derivado) | Le dice al cliente si su petición generó un efecto nuevo o si vio la respuesta de una operación ya ejecutada. |
