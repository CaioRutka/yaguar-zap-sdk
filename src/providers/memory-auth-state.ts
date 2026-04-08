import { Mutex } from 'async-mutex';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { AuthStateProvider } from './auth-state.provider.js';

const locks = new Map<string, Mutex>();

function mutexFor(key: string): Mutex {
  let m = locks.get(key);
  if (!m) {
    m = new Mutex();
    locks.set(key, m);
  }
  return m;
}

function fixFileName(file: string): string {
  return file.replace(/\//g, '__').replace(/:/g, '-');
}

/** fileKey → JSON serializado (BufferJSON) */
type SessionFileStore = Map<string, string>;

const sessions = new Map<string, SessionFileStore>();

function getOrCreateStore(sessionKey: string): SessionFileStore {
  let s = sessions.get(sessionKey);
  if (!s) {
    s = new Map();
    sessions.set(sessionKey, s);
  }
  return s;
}

/**
 * Auth state em memória (útil para testes e protótipos).
 * Não persiste entre reinícios do processo.
 */
export class MemoryAuthStateProvider implements AuthStateProvider {
  async loadState(sessionId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const sessionKey = sessionId.trim();
    if (!sessionKey) {
      throw new Error('sessionId vazio');
    }

    const col = getOrCreateStore(sessionKey);

    const readData = async (file: string): Promise<unknown | null> => {
      const fileKey = fixFileName(file);
      const m = mutexFor(`${sessionKey}:${fileKey}`);
      return m.runExclusive(async () => {
        const json = col.get(fileKey);
        if (!json) return null;
        return JSON.parse(json, BufferJSON.reviver) as unknown;
      });
    };

    const writeData = async (data: unknown, file: string): Promise<void> => {
      const fileKey = fixFileName(file);
      const m = mutexFor(`${sessionKey}:${fileKey}`);
      await m.runExclusive(async () => {
        const json = JSON.stringify(data, BufferJSON.replacer);
        col.set(fileKey, json);
      });
    };

    const removeData = async (file: string): Promise<void> => {
      const fileKey = fixFileName(file);
      const m = mutexFor(`${sessionKey}:${fileKey}`);
      await m.runExclusive(async () => {
        col.delete(fileKey);
      });
    };

    const credsRaw = await readData('creds.json');
    const creds = (credsRaw as AuthenticationCreds | null) ?? initAuthCreds();

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = (await readData(`${type}-${id}.json`)) as unknown;
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
              }
              data[id] = value as SignalDataTypeMap[T];
            }),
          );
          return data;
        },
        set: async (d: SignalDataSet) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(d) as (keyof SignalDataSet)[]) {
            const bucket = d[category];
            if (!bucket) continue;
            for (const id of Object.keys(bucket)) {
              const value = bucket[id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    };

    const saveCreds = async () => {
      await writeData(creds, 'creds.json');
    };

    return { state, saveCreds };
  }

  async clearState(sessionId: string): Promise<void> {
    const sessionKey = sessionId.trim();
    if (!sessionKey) return;
    sessions.delete(sessionKey);
  }
}
