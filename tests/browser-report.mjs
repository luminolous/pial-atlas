import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

// Write new files first so readers never lock an output while it is being overwritten.
export async function writeBrowserFile(file,content){
  const pending=file+'.pending-'+randomUUID();
  await fs.writeFile(pending,content);
  for(let attempt=0;attempt<5;attempt++){
    try{await fs.rename(pending,file);return;}
    catch(error){
      if(!['EBUSY','EPERM','EACCES','UNKNOWN'].includes(error.code)||attempt===4)throw error;
      await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
    }
  }
}

export const writeBrowserReport=(file,result)=>writeBrowserFile(file,JSON.stringify(result,null,2));
