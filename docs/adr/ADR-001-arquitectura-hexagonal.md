# ADR-001: Adoptar arquitectura hexagonal dentro de un monolito modular

**Estado:** Aceptada

## Contexto

El dominio es financiero y sensible a precisión (cálculo de amortización, mora
y prelación de pagos). El Proyecto 1 excluye servidor HTTP, base de datos y
autenticación, pero el diseño debe anticipar la evolución hacia REST, un
frontend, un servidor MCP y un chat con IA (Proyecto Final), sin duplicar la
lógica de negocio en cada adaptador. También se requiere poder probar las
reglas financieras sin infraestructura (sin servidor, sin base de datos).

## Alternativas consideradas

- **Capas tradicionales.** Sencilla y conocida, pero con riesgo real de que
  las reglas de negocio terminen acopladas a controllers o repositorios.
- **Microservicios.** Permite escalar cada módulo por separado, pero introduce
  consistencia distribuida, transacciones de dinero entre servicios,
  despliegue y observabilidad complejos — desproporcionado para el alcance de
  P1 y para un dominio donde la exactitud del centavo importa más que el
  escalamiento independiente.
- **Hexagonal + monolito modular.** El núcleo financiero queda aislado de
  tecnologías externas; API REST, UI, MCP y chat se conectan como adaptadores
  primarios y PostgreSQL, el reloj real y OpenRouter como adaptadores
  secundarios.

## Decisión

Arquitectura **hexagonal (Ports & Adapters)** dentro de un **monolito
modular**, con módulos explícitos: Originación, Cálculo financiero, Cartera y
cobros, Cierres, y Contratos/API.

## Consecuencias positivas

- Testabilidad: el dominio se prueba sin servidor ni base de datos.
- Menor acoplamiento entre reglas de negocio e infraestructura.
- Una única fuente de verdad para los casos de uso que consumirán API, MCP y
  chat en el Proyecto Final.
- Evolución incremental sin reescribir el núcleo financiero.

## Consecuencias negativas

- Más interfaces (puertos) y disciplina estructural desde el inicio.
- Requiere mantener la frontera del dominio libre de imports de
  infraestructura (Express, `pg`, SDK de OpenRouter, etc.) de forma constante.
