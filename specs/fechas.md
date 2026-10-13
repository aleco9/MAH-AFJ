# MOD02 — Fechas protegidas

## Necesidad y resultado esperado

Adelantar, atrasar, incorporar, eliminar o poner null en una de las siete rutas declaradas requiere plan, aprobación por otra cuenta y ejecución del solicitante.

## Contrato y aceptación

Pruebas ejecutables: AC01, AC10. Escenarios y pasos Dado/Cuando/Entonces en scenarios.json. Implementación: src/domain.cjs; src/store.cjs. Las comprobaciones deben observar comportamiento; las escrituras SQL de amenaza son ataques sintéticos explícitos.

## Límites

Perfil de laboratorio; fechas en texto libre u otras rutas no se interpretan.

## Evidencia y cambios

Ejecutar npm run quality. Conservar el resultado y hashes de cada corrida. Una modificación de reglas o aserciones requiere motivo, diff revisado y actualización explícita de la línea base; la compuerta no lo hace automáticamente.
