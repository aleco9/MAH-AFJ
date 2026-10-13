'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path'),e=require('./environment.cjs');
const target=path.resolve(process.env.SDD_TEST_ROOT??e.project),cfg=e.config(),u=e.database(e.bases().suite);
u.searchParams.set('options','-c search_path='+process.env.SDD_QA_SCHEMA);
const local={...cfg,database:u.toString(),qaDatabase:u.toString()};for(const [file,value] of [[target+'/test/config.cjs',local]])require.cache[file]={id:file,filename:file,loaded:true,exports:value};
