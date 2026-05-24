import { describe, it, expect } from 'vitest';
import { isBlockedAddress } from '@/src/lib/http-client';

describe('SSRF guard — isBlockedAddress', () => {
  describe('IPv4 — bloqueados', () => {
    const cases: Array<[string, string]> = [
      ['127.0.0.1', 'loopback'],
      ['127.99.88.77', 'loopback range'],
      ['10.0.0.1', 'RFC1918'],
      ['10.255.255.255', 'RFC1918'],
      ['172.16.0.1', 'RFC1918'],
      ['172.31.255.254', 'RFC1918'],
      ['192.168.0.1', 'RFC1918'],
      ['192.168.255.255', 'RFC1918'],
      ['169.254.0.1', 'link-local'],
      ['169.254.169.254', 'AWS/GCP metadata!'],
      ['100.64.0.1', 'CGNAT'],
      ['0.0.0.0', 'this network'],
      ['224.0.0.1', 'multicast'],
      ['255.255.255.255', 'broadcast'],
      ['192.0.0.1', 'IETF assignments'],
      ['198.18.0.1', 'benchmarking'],
    ];
    for (const [ip, label] of cases) {
      it(`bloqueia ${ip} (${label})`, () => {
        expect(isBlockedAddress(ip, 4)).toBe(true);
      });
    }
  });

  describe('IPv4 — permitidos', () => {
    const cases = ['8.8.8.8', '1.1.1.1', '142.250.190.46', '93.184.216.34', '203.0.114.5'];
    for (const ip of cases) {
      it(`permite ${ip}`, () => {
        expect(isBlockedAddress(ip, 4)).toBe(false);
      });
    }
  });

  describe('IPv6 — bloqueados', () => {
    const cases: Array<[string, string]> = [
      ['::1', 'loopback'],
      ['::', 'unspecified'],
      ['fe80::1', 'link-local'],
      ['fc00::1', 'unique local'],
      ['fd12:3456::1', 'unique local'],
      ['ff02::1', 'multicast'],
      ['::ffff:127.0.0.1', 'v4-mapped loopback'],
      ['::ffff:10.0.0.1', 'v4-mapped RFC1918'],
    ];
    for (const [ip, label] of cases) {
      it(`bloqueia ${ip} (${label})`, () => {
        expect(isBlockedAddress(ip, 6)).toBe(true);
      });
    }
  });

  describe('IPv6 — permitidos', () => {
    const cases = ['2001:4860:4860::8888', '2606:4700:4700::1111'];
    for (const ip of cases) {
      it(`permite ${ip}`, () => {
        expect(isBlockedAddress(ip, 6)).toBe(false);
      });
    }
  });

  describe('family inválido', () => {
    it('bloqueia se family != 4 e != 6', () => {
      expect(isBlockedAddress('1.2.3.4', 0 as 4)).toBe(true);
    });
  });
});
