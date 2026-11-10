import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const HOME = '/home/tenno';

describe('loadConfig', () => {
  it('defaults to 127.0.0.1:4317 and ~/.local/share/warframehub', () => {
    expect(loadConfig({}, HOME)).toEqual({
      host: '127.0.0.1',
      port: 4317,
      dataDir: '/home/tenno/.local/share/warframehub',
    });
  });

  it('reads WFHUB_HOST and WFHUB_PORT', () => {
    expect(loadConfig({ WFHUB_HOST: '0.0.0.0', WFHUB_PORT: '5000' }, HOME)).toMatchObject({
      host: '0.0.0.0',
      port: 5000,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ WFHUB_PORT: 'abc' }, HOME)).toThrow(/WFHUB_PORT/);
  });
});

describe('data directory', () => {
  it('uses $XDG_DATA_HOME when it is absolute', () => {
    expect(loadConfig({ XDG_DATA_HOME: '/data' }, HOME).dataDir).toBe('/data/warframehub');
  });

  it('ignores a relative $XDG_DATA_HOME, as the XDG spec says', () => {
    expect(loadConfig({ XDG_DATA_HOME: 'data' }, HOME).dataDir).toBe(
      '/home/tenno/.local/share/warframehub',
    );
  });

  it('WFHUB_DATA_DIR wins over everything', () => {
    expect(loadConfig({ WFHUB_DATA_DIR: '/srv/wf', XDG_DATA_HOME: '/data' }, HOME).dataDir).toBe(
      '/srv/wf',
    );
  });

  it('rejects a relative WFHUB_DATA_DIR', () => {
    expect(() => loadConfig({ WFHUB_DATA_DIR: 'wf' }, HOME)).toThrow(/WFHUB_DATA_DIR/);
  });
});
