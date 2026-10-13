# MOD05 — Integridad y contexto semántico

## Necesidad y resultado esperado

Verificar bytes/cuerpo, hash de archivo ligado al evento, contexto canónico y cabecera vigente. Detectar manipulación de fecha, tipo, texto o actor según la evidencia conservada.

## Contrato y aceptación

Pruebas ejecutables: AC03, AC06, AC07. Escenarios y pasos Dado/Cuando/Entonces en scenarios.json. Implementación: src/domain.cjs; src/store.cjs. Las comprobaciones deben observar comportamiento; las escrituras SQL de amenaza son ataques sintéticos explícitos.

## Límites

Hash requiere referencia confiable; SHA-256 no firma a un juez ni establece validez jurídica.

## Evidencia y cambios

Ejecutar npm run quality. Conservar el resultado y hashes de cada corrida. Una modificación de reglas o aserciones requiere motivo, diff revisado y actualización explícita de la línea base; la compuerta no lo hace automáticamente.
