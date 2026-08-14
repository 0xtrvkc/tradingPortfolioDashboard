// scripts/poll.js
// Runs once per GitHub Actions trigger (see .github/workflows/poll.yml).
// Connects to your XM account via MetaApi using the INVESTOR
// (read-only) password, pulls current data, and writes it to
// data/*.json — which the static dashboard reads directly.
//
// No server process, no trading code path. Credentials only ever
// exist as GitHub Secrets injected as env vars during this run.

import fs from 'fs';
import path from 'path';
import MetaApi from 'metaapi.cloud-sdk/esm-node';

const {
  METAAPI_TOKEN,
  XM_LOGIN,
  XM_INVESTOR_PASSWORD,
  XM_SERVER
} = process.env;

if (!METAAPI_TOKEN || !XM_LOGIN || !XM_INVESTOR_PASSWORD || !XM_SERVER) {
  console.error('Missing required secrets/env vars.');
  process.exit(1);
}

const DATA_DIR = path.join(process.cwd(), 'data');
const MAX_CURVE_POINTS = 2000; // ~20 days of history at 15-min polling

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, file),
    JSON.stringify(data, null, 2)
  );
}

async function main() {
  const api = new MetaApi(METAAPI_TOKEN);

  // Reuse the account if it already exists in your MetaApi project,
  // otherwise provision it (idempotent — safe to run every time).
  const accounts = await api.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
  let account = accounts.find(
    (a) => a.login === XM_LOGIN && a.server === XM_SERVER
  );

  if (!account) {
    console.log('No existing MetaApi account found — creating one...');
    account = await api.metatraderAccountApi.createAccount({
      name: 'XM Watch-Only',
      type: 'cloud',
      login: XM_LOGIN,
      password: XM_INVESTOR_PASSWORD,
      server: XM_SERVER,
      platform: 'mt5', // change to 'mt4' if applicable
      magic: 0
    });
  }

  if (account.state !== 'DEPLOYED') {
    console.log('Deploying account...');
    await account.deploy();
  }
  await account.waitConnected();

  const connection = account.getRPCConnection();
  await connection.connect();
  await connection.waitSynchronized();

  const info = await connection.getAccountInformation();
  const positions = await connection.getPositions();

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deals = await connection.getDealsByTimeRange(since, new Date());

  const summary = {
    balance: info.balance,
    equity: info.equity,
    margin: info.margin,
    freeMargin: info.freeMargin,
    marginLevel: info.marginLevel,
    currency: info.currency,
    leverage: info.leverage,
    lastUpdated: new Date().toISOString()
  };

  const positionsOut = positions.map((p) => ({
    symbol: p.symbol,
    type: p.type,
    volume: p.volume,
    openPrice: p.openPrice,
    currentPrice: p.currentPrice,
    profit: p.profit,
    openTime: p.time
  }));

  const tradesOut = deals
    .filter((d) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL')
    .map((d) => ({
      id: d.id,
      symbol: d.symbol,
      type: d.type,
      volume: d.volume,
      price: d.price,
      profit: d.profit,
      time: d.time
    }))
    .sort((a, b) => new Date(b.time) - new Date(a.time));

  // Append to the existing equity curve rather than overwriting it —
  // each poll is one more data point in the history.
  const curve = readJSON('equity-curve.json', []);
  curve.push({
    time: new Date().toISOString(),
    equity: info.equity,
    balance: info.balance
  });
  while (curve.length > MAX_CURVE_POINTS) curve.shift();

  writeJSON('summary.json', summary);
  writeJSON('positions.json', { positions: positionsOut });
  writeJSON('trades.json', { trades: tradesOut });
  writeJSON('equity-curve.json', curve);

  console.log(`Done. equity=${info.equity} balance=${info.balance}`);

  // Actions runners don't need a persistent connection — close and exit
  // cleanly so the job doesn't hang.
  await connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Poll failed:', err);
  process.exit(1);
});
