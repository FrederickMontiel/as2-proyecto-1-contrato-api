# Colección de Postman — Proyecto 1 (contrato completo)

35 peticiones precargadas contra el contrato completo del SGMC (`final/openapi.yaml`):
Clientes, Solicitudes, Créditos, Pagos y Cierres/Cartera en riesgo. Cada caso de
error trae su prueba automática (`pm.test`) que verifica el código HTTP y que
el `status` dentro del cuerpo coincide.

## Puesta en marcha

1. Genere y levante el servidor simulado (Prism) desde `final/`:
   ```bash
   cd final
   npm install
   npm run generar
   npx @stoplight/prism-cli mock openapi.yaml
   ```
2. En Postman: **File → Import** → seleccione ambos archivos de esta carpeta
   (`SGMC-Final.postman_collection.json` y `SGMC-Local.postman_environment.json`).
3. Seleccione el environment **«SGMC · Local (Prism)»** en la esquina superior derecha.
4. Ejecute las peticiones una por una, o use **Collection Runner** para correrlas todas.

## La cabecera `Prefer`

Cuando una operación define varias respuestas posibles (por ejemplo 404, 409,
422, 429, 500), Prism no puede adivinar cuál quiere usted probar. La cabecera
`Prefer: code=XXX` se lo indica explícitamente. Sin ella, Prism siempre
responde con el primer caso exitoso que encuentre — esto incluye
`POST /creditos/{id}/pagos`, que define tanto 200 (reintento) como 201
(registro nuevo): incluso la petición "201 · Pago registrado" lleva
`Prefer: code=201`.

## Orden sugerido para el flujo feliz completo

Ver `../../docs/FLUJOS-DE-EJEMPLO.md` para la secuencia end-to-end
(cliente → solicitud → aprobación → desembolso → pago → cierre → cartera en
riesgo) con las peticiones exactas de esta colección.
