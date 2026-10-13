# MAH-AFJ — prototipo académico

Modelo híbrido Hyperledger Fabric–PostgreSQL para integridad verificable y auditoría de eventos judiciales SIREJ/SIGC. Solo datos sintéticos. No es un sistema institucional ni certificación de capacidad/seguridad.

## Calidad

Node.js 24. `npm run quality:fast` ejecuta validaciones de trazabilidad y herramientas sin credenciales ni DB. `npm run ci` ejecuta integración y necesita laboratorio PostgreSQL/Fabric/Chromium configurado localmente. Workflow rápido: push/PR. Laboratorio: workflow_dispatch, runner self-hosted mah-afj-lab y entorno mah-afj-lab-reviewed.

El contrato vigente está en specs/scenarios.json. La matriz traceability.json vincula requisitos/diseño/pruebas; authority-catalog.json conserva referencias y hashes de documentos externos. Esos documentos no se publican; su ausencia se informa como EXTERNAL_NOT_AVAILABLE.

La referencia de criterios se administra fuera del checkout con QA_TRUST_DIR y QA_TRUST_SHA256. No se promueve automáticamente en CI. Los scripts baseline/promote sirven para revisión técnica local, no para inventar aprobación humana independiente.

La publicación deriva de un snapshot verificado del prototipo. Los hashes y la configuración de publicación se registran localmente en el ecosistema de investigación. No incluye claves, configuración privada, bases de datos, capítulos de tesis o reportes privados.

## Límites

Triggers UPDATE/DELETE en tablas declaradas; sin CDC/WAL ni resistencia a administrador que controle DB y evidencia. Una cuenta técnica no prueba identidad humana. Payload fuera de Fabric; hashes/metadatos mínimos. Outbox, doble hash y contexto semántico siguen candidatas experimentales. Métricas no funcionales se ligan a una versión y perfil; PASS funcional no acredita jornada sostenida.

Cinco tareas de agente en evals/. Preparación: `npm run evals:prepare -- E01`. Calificador externo al candidato: `npm run evals:grade -- /ruta/control --execute`. Aislar candidato/evaluador con sandbox y permisos; verificar configuración y límites del agente.
