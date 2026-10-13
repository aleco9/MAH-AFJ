# MOD06 — Outbox y anclaje

## Necesidad y resultado esperado

Persistir evento y outbox juntos. PENDING/UNKNOWN no prueban confirmación. Reconciliar hash remoto y preservar reintento/fencing y cuarentena.

## Contrato y aceptación

Pruebas ejecutables: AC08, AC09. Escenarios y pasos Dado/Cuando/Entonces en scenarios.json. Implementación: src/store.cjs; src/ledger.cjs; chaincode/main.go. Las comprobaciones deben observar comportamiento; las escrituras SQL de amenaza son ataques sintéticos explícitos.

## Límites

Candidata experimental; red local, un orderer y dominios lógicos. Capacidad sostenida pendiente para la versión evaluada.

## Evidencia y cambios

Ejecutar npm run quality. Conservar el resultado y hashes de cada corrida. Una modificación de reglas o aserciones requiere motivo, diff revisado y actualización explícita de la línea base; la compuerta no lo hace automáticamente.
