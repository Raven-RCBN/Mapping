import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadPack, serverURL } from '../src/offline';
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/documents',
  mkdir: jest.fn().mockResolvedValue(undefined),
  downloadFile: jest.fn(() => ({
    promise: Promise.resolve({ statusCode: 200 }),
  })),
  hash: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn(),
}));
const old = {
  folder: '/documents/estate-atlas/previous',
  subject: 'manager',
  createdAt: '2026-09-01',
  estates: ['Estate A'],
};
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(old));
  (globalThis as any).fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        createdAt: '2026-10-04',
        files: [
          {
            id: 'image-a',
            url: '/api/assets/image-a/file',
            mime: 'image/png',
            sha256: 'a'.repeat(64),
          },
        ],
        snapshot: {
          access: { subject: 'manager' },
          estates: [{ name: 'Estate A' }],
          assets: [{ id: 'image-a', kind: 'imagery' }],
        },
      }),
    });
});
test('failed checksum preserves the previous offline package', async () => {
  (RNFS.hash as jest.Mock).mockResolvedValue('b'.repeat(64));
  await expect(
    downloadPack('https://mapping.example', 'token', ['estate-a'], () => {}),
  ).rejects.toThrow('checksum');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(RNFS.unlink).not.toHaveBeenCalledWith(old.folder);
});
test('complete download writes local HTML then replaces the active manifest', async () => {
  (RNFS.hash as jest.Mock).mockResolvedValue('a'.repeat(64));
  const saved = await downloadPack(
    'https://mapping.example',
    'token',
    ['estate-a'],
    () => {},
  );
  expect(saved.estates).toEqual(['Estate A']);
  expect(RNFS.writeFile).toHaveBeenCalledWith(
    saved.folder + '/index.html',
    expect.stringContaining('image-a.png'),
    'utf8',
  );
  expect(AsyncStorage.setItem).toHaveBeenCalled();
  expect(RNFS.unlink).toHaveBeenCalledWith(old.folder);
});
test('hosting address permits HTTPS and local development only', () => {
  expect(serverURL('https://mapping.example/')).toBe('https://mapping.example');
  expect(() => serverURL('http://other-host.example')).toThrow('HTTPS');
  expect(() => serverURL('https://host.example/path')).toThrow('HTTPS');
});
