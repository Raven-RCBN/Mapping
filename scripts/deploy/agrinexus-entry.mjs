import fs from 'node:fs/promises';
import { mountEstateAtlas } from '../../apps/api/src/integrations/agrinexus.js';
import { seedEstateAtlas } from './agrinexus-seed.mjs';

export async function registerEstateAtlas(app, connection, AuthHandler) {
  const root = '/opt/digitalpalm/agrinexus/estate-atlas';
  const marker = root + '/data/.seed-v1-applied';
  try { await fs.access(marker); }
  catch {
    const counts = await seedEstateAtlas(connection, root + '/current/seed.json', root + '/data');
    await fs.writeFile(marker, JSON.stringify({ at: new Date().toISOString(), counts }));
    console.log('EstateAtlas initial import:', counts);
  }
  await mountEstateAtlas(app, {
    connection, AuthHandler, dataDir: root + '/data',
    qgisCommand: root + '/tools/render-qgis',
  });
  console.log('EstateAtlas mounted at /api/EstateAtlas');
}
