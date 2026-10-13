'use strict';
const {Pool}=require('pg'),e=require('./environment.cjs');
(async()=>{const schema=process.env.SDD_QA_SCHEMA;if(!/^qa_flow_[a-z0-9_]+$/.test(schema??''))throw Error('QUALITY_SCHEMA_INVALID');const pool=new Pool({connectionString:e.database(e.bases().suite).toString()});try{await pool.query('CREATE SCHEMA '+schema);}finally{await pool.end();}})().catch(x=>{console.error(x.code??'QUALITY_SCHEMA_FAILED');process.exitCode=1;});
