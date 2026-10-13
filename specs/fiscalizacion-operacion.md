# MOD07 — Fiscalización y operación

## Necesidad y resultado esperado

Org1/Org2 reciben avisos sin auditar expedientes uno a uno; muestran campo/valor anterior/nuevo y origen de identidad. Exponer salud, pendientes y estados de cola.

## Contrato y aceptación

Pruebas ejecutables: AC11; compuerta 04-browser. Escenarios y pasos Dado/Cuando/Entonces en scenarios.json. Implementación: src/server.cjs; web/app.js; scripts/quality/templates/browser.cjs. Las comprobaciones deben observar comportamiento; las escrituras SQL de amenaza son ataques sintéticos explícitos.

## Límites

SSE recuperable; ventana observada no garantía universal. QA acompaña requisitos y desarrollo; evaluación experta humana pendiente.

## Evidencia y cambios

Ejecutar npm run quality. Conservar el resultado y hashes de cada corrida. Una modificación de reglas o aserciones requiere motivo, diff revisado y actualización explícita de la línea base; la compuerta no lo hace automáticamente.
