# ADR-002: Representar importes con Value Object Dinero y decimal.js

**Estado:** Aceptada

## Contexto

Los importes del sistema (capital, cuotas, mora, intereses) no pueden sufrir
errores binarios de punto flotante: un centavo incorrecto altera saldos,
intereses y cierres de todo un período. Esto aplica tanto al núcleo de
dominio como al contrato de API — un importe que viaja como número JSON se
convierte a `double` IEEE-754 en el cliente y deja de ser exacto.

## Alternativas consideradas

- **`Number` nativo de JavaScript/TypeScript.** Simple, pero sujeto a error
  de redondeo binario (`0.1 + 0.2 !== 0.3`); inaceptable para dinero.
- **Enteros en centavos.** Exacto y rápido, pero desplaza la responsabilidad
  de conversión (centavos ↔ formato legible) a cada punto de entrada/salida,
  con riesgo de inconsistencia entre módulos.
- **`decimal.js` + Value Object `Dinero`.** Aritmética decimal exacta,
  encapsulada en un único tipo inmutable con moneda.

## Decisión

Representar cada importe con un Value Object `Dinero` inmutable
(`{ valor, moneda }`), respaldado internamente por `decimal.js`, con
redondeo HALF_UP a 2 decimales. En el contrato de API, `valor` viaja siempre
como **cadena decimal de punto fijo con 2 decimales** (nunca como número
JSON), acompañada del código de moneda ISO 4217 (`GTQ`).

## Consecuencias positivas

- Precisión garantizada en cálculos financieros y en el contrato expuesto.
- Reglas de redondeo centralizadas en un solo lugar del dominio.
- La moneda viaja explícita: no hay ambigüedad de unidad en ningún importe.

## Consecuencias negativas

- Dependencia adicional (`decimal.js`) en el núcleo.
- Toda frontera de entrada/salida debe convertir explícitamente entre
  `Dinero` y la representación externa; no se puede usar `Number` como atajo
  en ningún punto del sistema.
