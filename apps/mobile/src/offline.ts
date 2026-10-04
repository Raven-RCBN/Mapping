import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import viewer from '../assets/viewer.json';
const root = RNFS.DocumentDirectoryPath + '/estate-atlas',
  key = 'mapping-offline-v1';
export type SavedPack = {
  folder: string;
  createdAt: string;
  subject: string;
  estates: string[];
};
export const savedPack = async (): Promise<SavedPack | null> => {
  const s = await AsyncStorage.getItem(key);
  return s ? JSON.parse(s) : null;
};
export async function removeSaved() {
  const old = await savedPack();
  await AsyncStorage.removeItem(key);
  if (old?.folder.startsWith(root + '/'))
    await RNFS.unlink(old.folder).catch(() => {});
}
export function serverURL(input: string) {
  const s = input.trim().replace(/\/$/, '');
  if (
    !/^https:\/\/[^\s/?#]+(?::\d+)?$/.test(s) &&
    !/^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2)(:\d+)?$/.test(s)
  )
    throw Error(
      'Use your HTTPS hosting address (or the local emulator address).',
    );
  return s;
}
export async function loadEstates(host: string, token: string) {
  const response = await fetch(serverURL(host) + '/api/snapshot', {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!response.ok)
    throw Error('Connection or access denied (' + response.status + ').');
  return response.json();
}
export async function downloadPack(
  host: string,
  token: string,
  ids: string[],
  progress: (s: string) => void,
): Promise<SavedPack> {
  const base = serverURL(host),
    headers = { Authorization: 'Bearer ' + token };
  const response = await fetch(
    base + '/api/offline?estates=' + ids.map(encodeURIComponent).join(','),
    { headers },
  );
  if (!response.ok) throw Error('Unable to download these estates.');
  const pack = await response.json();
  const folder = root + '/' + Date.now();
  await RNFS.mkdir(folder);
  try {
    if (!Array.isArray(pack.files) || !pack.snapshot?.access?.subject)
      throw Error('Invalid offline manifest');
    for (let i = 0; i < pack.files.length; i++) {
      const f = pack.files[i];
      if (
        !/^[a-zA-Z0-9-]+$/.test(f.id) ||
        !/^\/api\/assets\/[a-zA-Z0-9-]+\/file$/.test(f.url) ||
        !/^[a-f0-9]{64}$/.test(f.sha256)
      )
        throw Error('Invalid file in manifest');
      const ext = f.mime === 'application/json' ? '.json' : '.png',
        filename = f.id + ext,
        full = folder + '/' + filename;
      progress(`Saving ${i + 1} of ${pack.files.length} files…`);
      const result = await RNFS.downloadFile({
        fromUrl: base + f.url,
        toFile: full,
        headers,
        connectionTimeout: 15000,
        readTimeout: 60000,
      }).promise;
      if (result.statusCode !== 200) throw Error('A map download failed.');
      if ((await RNFS.hash(full, 'sha256')) !== f.sha256)
        throw Error('Map checksum mismatch.');
      const asset = pack.snapshot.assets.find((a: any) => a.id === f.id);
      if (asset) {
        asset.localFile = filename;
        if (asset.kind === 'contours')
          asset.json = JSON.parse(await RNFS.readFile(full, 'utf8'));
      }
    }
    const json = JSON.stringify(pack).replace(/</g, '\\u003c');
    await RNFS.writeFile(
      folder + '/index.html',
      viewer.html.replace('__PACK__', () => json),
      'utf8',
    );
    await RNFS.writeFile(
      folder + '/manifest.json',
      JSON.stringify(pack),
      'utf8',
    );
    const saved = {
        folder,
        createdAt: pack.createdAt,
        subject: pack.snapshot.access.subject,
        estates: pack.snapshot.estates.map((e: any) => e.name),
      },
      previous = await savedPack();
    await AsyncStorage.setItem(key, JSON.stringify(saved));
    if (previous?.folder.startsWith(root + '/'))
      await RNFS.unlink(previous.folder).catch(() => {});
    return saved;
  } catch (e) {
    await RNFS.unlink(folder).catch(() => {});
    throw e;
  }
}
