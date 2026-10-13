# MOD04 — Captura SQL y auditoría

## Necesidad y resultado esperado

Cada UPDATE/DELETE comprometido en las seis tablas cubiertas conserva OLD/NEW y cuenta técnica. Publicar evidencia automática y conservar A→B→A; recuperar pendientes sin duplicarlos.

## Contrato y aceptación

Pruebas ejecutables: AC04. Escenarios y pasos Dado/Cuando/Entonces en scenarios.json. Implementación: src/schema.sql; src/store.cjs. Las comprobaciones deben observar comportamiento; las escrituras SQL de amenaza son ataques sintéticos explícitos.

## Límites

Triggers en la misma DB; sin CDC/WAL, resistencia a superusuario, INSERT, DDL o archivos externos; ROLLBACK revierte captura.

## Evidencia y cambios

Ejecutar npm run quality. Conservar el resultado y hashes de cada corrida. Una modificación de reglas o aserciones requiere motivo, diff revisado y actualización explícita de la línea base; la compuerta no lo hace automáticamente.
