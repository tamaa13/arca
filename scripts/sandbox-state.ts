import { Wallet } from "ethers";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { SandboxClient } from "../src/sandbox/client.js";
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const client = new SandboxClient(new Wallet(key));
const id = "58ae1305-9cc6-47a9-902d-45ebe8112d90";
try { console.log("getSandbox:", JSON.stringify(await client.getSandbox(id))); }
catch(e:any){ console.log("getSandbox ERR:", e.message.slice(0,120)); }
try {
  const list = await client.listSandboxes();
  console.log("ALL:", JSON.stringify(list.map((s:any)=>({id:s.id.slice(0,8),state:s.state,name:s.name,img:s.imageName}))));
} catch(e:any){ console.log("list ERR:", e.message.slice(0,120)); }
