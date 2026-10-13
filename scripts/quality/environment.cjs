'use strict';
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'../..');
function config(){let cfg,u;try{cfg=require(project+'/src/config.cjs').load();u=new URL(cfg.database);}catch{throw Error('QUALITY_CONFIGURATION_UNAVAILABLE');}if(u.hostname!=='127.0.0.1'||u.port!=='55433')throw Error('QUALITY_REQUIRES_LOCAL_LAB');return cfg;}
function runDir(){if(!process.env.SDD_RUN_DIR)throw Error('QUALITY_RUN_REQUIRED');return path.resolve(process.env.SDD_RUN_DIR);}
function database(name){if(!/^qa_flow_[a-z0-9_]+$/.test(name))throw Error('QUALITY_DATABASE_INVALID');const u=new URL(config().database);u.pathname='/'+name;u.searchParams.delete('options');return u;}
function bases(){return JSON.parse(fs.readFileSync(path.join(runDir(),'bases.json'),'utf8'));}
module.exports={project,config,runDir,database,bases};
