// ============================================================
//  MBZ::CH4TB0T NEXUS v4.1.1 — lib/datadir.js
//  Onde ficam blogs.json e history.json. Ordem: DATA_DIR → volume do Railway
//  (RAILWAY_VOLUME_MOUNT_PATH, setado automaticamente quando há Volume anexado)
//  → ./data (EFÊMERO: some a cada deploy no Railway).
// ============================================================
const path = require('path');

function resolveDataDir() {
  if (process.env.DATA_DIR) return { dir: process.env.DATA_DIR, source: 'DATA_DIR', persistent: true };
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return { dir: process.env.RAILWAY_VOLUME_MOUNT_PATH, source: 'railway-volume', persistent: true };
  const onRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  return { dir: path.join(__dirname, '..', 'data'), source: 'local', persistent: !onRailway };
}
const info = resolveDataDir();
module.exports = { DATA_DIR: info.dir, storageInfo: () => Object.assign({}, info) };
