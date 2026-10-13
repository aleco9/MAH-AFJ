
'use strict';
module.exports=async function* (source){for await(const event of source)if(['test:pass','test:fail'].includes(event.type)){const d=event.data;yield JSON.stringify({type:event.type,name:d.name,file:d.file??null,skip:Boolean(d.skip),todo:Boolean(d.todo),failureType:d.details?.error?.failureType??null,errorCode:d.details?.error?.cause?.code??d.details?.error?.code??null})+'\n';}};
