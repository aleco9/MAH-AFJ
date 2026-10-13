const cfg=require('../src/config.cjs').load();
if(!cfg.qaDatabase)throw new Error('Preparar bases de QA antes de ejecutar');
module.exports={...cfg,database:cfg.qaDatabase};
