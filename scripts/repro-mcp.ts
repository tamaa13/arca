const U = "https://arca.alpaca-parrotfish.ts.net/mcp";
const T = process.argv[2];
const H = (auth: boolean, sid?: string): Record<string,string> => ({ "content-type":"application/json", accept:"application/json, text/event-stream", ...(auth?{authorization:`Bearer ${T}`}:{}), ...(sid?{"mcp-session-id":sid}:{}) });
const b = (o: unknown) => JSON.stringify(o);
const init = { jsonrpc:"2.0", id:1, method:"initialize", params:{ protocolVersion:"2025-06-18", capabilities:{}, clientInfo:{name:"repro",version:"1"} } };
const recall = (q?: string) => ({ jsonrpc:"2.0", id:2, method:"tools/call", params:{ name:"recall_memory", arguments: q?{query:q}:{} } });
const snip = (t: string) => t.replace(/\n/g," ").replace(/data: /g,"").slice(-260);

const r1 = await fetch(U,{method:"POST",headers:H(true),body:b(init)});
const sid = r1.headers.get("mcp-session-id")||"";
console.log("INIT (with bearer):", r1.status, "| sid", sid.slice(0,8));
await fetch(U,{method:"POST",headers:H(true,sid),body:b({jsonrpc:"2.0",method:"notifications/initialized"})});

const r3 = await fetch(U,{method:"POST",headers:H(false,sid),body:b(recall())});
console.log("\nrecall NO bearer (OpenCode-style):", r3.status, "\n  →", snip(await r3.text()));

const r4 = await fetch(U,{method:"POST",headers:H(true,sid),body:b(recall())});
console.log("\nrecall WITH bearer:", r4.status, "\n  →", snip(await r4.text()));

const r5 = await fetch(U,{method:"POST",headers:H(true,sid),body:b(recall("baju"))});
console.log("\nrecall query=baju (with bearer):", r5.status, "\n  →", snip(await r5.text()));
