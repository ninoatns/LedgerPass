#!/usr/bin/env node
// Teste chaque noeud de XRPL_WS_URLS (latence, ledger validé) — utile sur le Wi-Fi de l'école.
import { config } from '../server/src/config.js';
import { connectAny } from '../server/src/xrpl/client.js';

let ok = 0;
for (const url of config.wsUrls) {
  const t0 = Date.now();
  try {
    const { client } = await connectAny([url]);
    const info = (await client.request({ command: 'server_info' })).result.info;
    console.log(`OK   ${url}  ${Date.now() - t0} ms  ledger=${info.validated_ledger?.seq}  version=${info.build_version}`);
    await client.disconnect();
    ok++;
  } catch (e) {
    console.log(`FAIL ${url}  ${e.message.split('\n').slice(-1)[0].trim()}`);
  }
}
console.log(config.proxy ? `(via proxy ${new URL(config.proxy).host})` : '(connexion directe)');
process.exit(ok ? 0 : 1);
