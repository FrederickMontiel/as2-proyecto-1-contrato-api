# ADR-003: Versionar políticas financieras y resolver variaciones mediante Strategy

**Estado:** Propuesta

## Contexto

Las políticas institucionales (tasa ordinaria, tasa moratoria, base de
conteo de días, método de amortización, estrategia de pago de más) pueden
cambiar con el tiempo, pero un crédito ya otorgado debe conservar las
condiciones vigentes al momento del desembolso. Recalcular créditos antiguos
con una política nueva rompería la trazabilidad y el historial de mora y
pagos.

## Decisión

Cada `PoliticaFinanciera` tiene versión, vigencia, autor y fecha. Un crédito
almacena la referencia a la versión de política vigente en su fecha de
otorgamiento (`PoliticaFinancieraVersion`), y las variaciones de
comportamiento (método de amortización, política de adelanto) se resuelven
mediante el patrón **Strategy**, sin condicionales dispersos en el dominio.

## Consecuencias

- Un cambio institucional (por ejemplo, una nueva tasa moratoria) no altera
  retrospectivamente los créditos otorgados bajo una política anterior.
- Agregar una nueva estrategia de amortización o de adelanto no requiere
  modificar el motor de cálculo, solo agregar una implementación del puerto
  correspondiente (principio abierto/cerrado).
- El contrato de API expone la política aplicada como parte del recurso
  `Credito`, para que un consumidor externo pueda auditar bajo qué reglas se
  calculó un crédito específico.
