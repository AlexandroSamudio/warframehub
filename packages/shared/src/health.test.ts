import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.js';

describe('HealthResponse', () => {
  it('accepts a valid health payload', () => {
    const payload = {
      status: 'ok',
      app: 'warframehub',
      version: '0.1.0',
      serverTime: '2026-11-10T00:00:00.000Z',
    };
    expect(HealthResponse.parse(payload)).toEqual(payload);
  });

  it('rejects a server time that is not ISO 8601', () => {
    const result = HealthResponse.safeParse({
      status: 'ok',
      app: 'warframehub',
      version: '0.1.0',
      serverTime: 'Tuesday',
    });
    expect(result.success).toBe(false);
  });
});
