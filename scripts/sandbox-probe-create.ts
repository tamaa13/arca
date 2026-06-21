import { Wallet } from "ethers";
import { randomBytes } from "node:crypto";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const key=fs.readFileSync(path.join(os.homedir(),".arca","key"),"utf8").trim();
const w=new Wallet(key);
const B="https://provider-private-sandbox-testnet.0g.ai";
async function sf(method:string,p:string,action:string,body?:any,resourceId=""){
  const req={action,expires_at:Math.floor(Date.now()/1000)+300,nonce:randomBytes(16).toString("hex"),payload:body??{},resource_id:resourceId};
  const json=JSON.stringify(req); const sig=await w.signMessage(json);
  const h:any={"X-Wallet-Address":w.address,"X-Signed-Message":Buffer.from(json,"utf8").toString("base64"),"X-Wallet-Signature":sig};
  if(body!==undefined)h["content-type"]="application/json";
  const r=await fetch(B+p,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  return `${r.status} ${(await r.text()).slice(0,180).replace(/\n/g,' ')}`;
}
const img="ghcr.io/tamaa13/arca-mcp:latest";
const probes:any[]=[
  ["POST","/api/snapshots","create",{name:"arca-mcp",image:img}],
  ["POST","/api/snapshots","snapshot",{name:"arca-mcp",image:img}],
  ["POST","/api/registry/images","create",{image:img}],
  ["POST","/api/snapshot","create",{name:"arca-mcp",image:img}],
  ["POST","/api/images","create",{image:img}],
];
for(const [m,p,a,b] of probes){
  try{console.log(`${m} ${p} [${a}] →`, await sf(m,p,a,b));}catch(e:any){console.log(`${m} ${p} ERR ${e.message.slice(0,50)}`);}
}
