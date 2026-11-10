import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('defaults to 127.0.0.1:4317', () => {
    expect(loadConfig({})).toEqual({ host: '127.0.0.1', port: 4317 });
  });

  it('reads WFHUB_HOST and WFHUB_PORT', () => {
    expect(loadConfig({ WFHUB_HOST: '0.0.0.0', WFHUB_PORT: '5000' })).toEqual({
      host: '0.0.0.0',
      port: 5000,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ WFHUB_PORT: 'abc' })).toThrow(/WFHUB_PORT/);
  });
});
