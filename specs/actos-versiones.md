# MOD01 — Actos y versiones

## Necesidad y resultado esperado

Preservar el original y la pertenencia de versiones. Un acto finalizado solo admite rectificación autorizada, creando una versión vinculada.

## Contrato y aceptación

Pruebas ejecutables: AC02. Escenarios y pasos Dado/Cuando/Entonces en scenarios.json. Implementación: src/store.cjs; src/schema.sql. Las comprobaciones deben observar comportamiento; las escrituras SQL de amenaza son ataques sintéticos explícitos.

## Límites

JSON sintético; no PDF/binario ni reglas jurídicas institucionales.

## Evidencia y cambios

Ejecutar npm run quality. Conservar el resultado y hashes de cada corrida. Una modificación de reglas o aserciones requiere motivo, diff revisado y actualización explícita de la línea base; la compuerta no lo hace automáticamente.
