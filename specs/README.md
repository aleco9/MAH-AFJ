# Especificaciones operativas y proceso de calidad

Este paquete aplica los aportes seleccionados de Miguel Angel Luccio Reyes y Fazt Code al prototipo independiente. Se basa en las necesidades ya autorizadas y en la implementación corregida; no reemplaza PRD/ERS/SDD históricos ni modifica el capítulo 4. Desarrollo guiado por especificaciones es el proceso; documento de diseño SDD es un artefacto.

Leer primero scenarios.json y el módulo correspondiente. Definir/ajustar criterio antes de editar; trabajar por requisito, con prueba que reproduzca la brecha, implementación mínima y regresión. Para controles existentes se verifica una línea base y después se comprueba si la prueba detecta mutaciones controladas. No presentar todas las pruebas existentes como resultado de TDD histórico.

Dado/Cuando/Entonces se vincula a tests Node con IDs AC01–AC11; no requiere instalar Cucumber. La recepción y visualización real en operador/Org1/Org2 se verifica en la compuerta Playwright. La revisión de agentes propone hallazgos; cada defecto necesita reproducción. La auditoría local asistida no constituye revisión humana independiente.

La condición de cierre es el contrato verificado y todas las compuertas necesarias aprobadas. El runner tiene timeout y se detiene ante fallos; no cambia criterios, no reinicia una jornada, no instala skills, no publica ni modifica datos anteriores. QA acompaña el ciclo; mantener salud de captura y cola visible en /api/metrics.

Middleware/outbox, doble hash y contexto semántico siguen candidatas. No traducir benchmarks de los videos ni métricas de una versión anterior en capacidad actual. Rendimiento sostenido e infraestructura institucional tienen pendientes explícitos en scenarios.json.

La matriz operativa de este incremento está en traceability.json, con catálogo documental authority-catalog.json. Los resultados exactos de aceptación proceden del reporter Node; el manifiesto y provenance del informe identifican la versión. Las decisiones NF están en nonfunctional.json y se mantienen separadas del PASS funcional. La referencia externa no se promueve automáticamente: véanse los dos comandos de revisión en README.
