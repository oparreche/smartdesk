import { describe, it, expect } from 'vitest';
import { safeFetch, SsrfBlockedError } from '@/src/lib/http-client';

describe('safeFetch — bloqueios de URL', () => {
  it('rejeita protocolo file://', async () => {
    await expect(safeFetch('file:///etc/passwd', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita protocolo gopher://', async () => {
    await expect(safeFetch('gopher://example.com/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita localhost', async () => {
    await expect(safeFetch('http://localhost:80/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita 127.0.0.1', async () => {
    await expect(safeFetch('http://127.0.0.1/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita 10.x', async () => {
    await expect(safeFetch('http://10.5.5.5/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita 169.254.169.254 (AWS metadata)', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita 192.168.x', async () => {
    await expect(safeFetch('http://192.168.0.1/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita IPv6 loopback', async () => {
    await expect(safeFetch('http://[::1]/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita porta proibida (3306 MySQL)', async () => {
    await expect(safeFetch('http://1.1.1.1:3306/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita IP em formato decimal único (2130706433 = 127.0.0.1)', async () => {
    await expect(safeFetch('http://2130706433/', { method: 'GET' })).rejects.toBeInstanceOf(
      SsrfBlockedError,
    );
  });

  it('rejeita hostname inexistente (DNS falha)', async () => {
    await expect(
      safeFetch('http://this-host-does-not-exist-smartdesk-12345.invalid/', { method: 'GET' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
