import { Wallet } from "ethers";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { SandboxClient } from "../src/sandbox/client.js";
const key = fs.readFileSync(path.join(os.homedir(), ".arca", "key"), "utf8").trim();
const c = new SandboxClient(new Wallet(key));
const id = process.env.SANDBOX_ID || "99f8c291-0b42-49b4-ac10-94a46bf23315";
const r = await c.exec(id, "bash -c 'echo PS:; ps aux | grep -E \"bun\" | grep -v grep | head -3; echo COMMIT:; cd $HOME/arca && git log --oneline -1; echo STAGES:; grep STAGE /tmp/arca-boot.log'", 40);
console.log(r.stdout || r.result || JSON.stringify(r));
