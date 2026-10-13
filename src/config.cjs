'use strict';
const fs=require('node:fs');const path=require('node:path');
function load(){return JSON.parse(fs.readFileSync(path.join(__dirname,'../.local/config.json'),'utf8'));}
module.exports={load};
