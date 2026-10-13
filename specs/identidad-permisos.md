# MOD03 — Identidad, permisos y rechazos

## Necesidad y resultado esperado

Un fiscalizador consulta evidencia y registra acuse de su organización; no modifica actos. Todo rechazo debe preservar cuenta y motivo sin copiar secretos.

## Contrato y aceptación

Pruebas ejecutables: AC05. Escenarios y pasos Dado/Cuando/Entonces en scenarios.json. Implementación: src/server.cjs; src/store.cjs. Las comprobaciones deben observar comportamiento; las escrituras SQL de amenaza son ataques sintéticos explícitos.

## Límites

Cuentas sintéticas; una cuenta PostgreSQL no identifica a una persona física.

## Evidencia y cambios

Ejecutar npm run quality. Conservar el resultado y hashes de cada corrida. Una modificación de reglas o aserciones requiere motivo, diff revisado y actualización explícita de la línea base; la compuerta no lo hace automáticamente.
