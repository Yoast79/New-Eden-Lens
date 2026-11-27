import { describe, expect, it } from 'vitest';
import { parseEveClipboard } from '@/core/parsers/eveClipboard';

describe('parseEveClipboard', () => {
  it('parses EFT ship fittings with modules, charges, offline flags, and drones', () => {
    const eft = `[Gila, Abyssal T5]
Drone Damage Amplifier II
Drone Damage Amplifier II

10MN Afterburner II
Multispectrum Shield Hardener II /OFFLINE

Rapid Light Missile Launcher II, Scourge Fury Light Missile
Rapid Light Missile Launcher II, Scourge Fury Light Missile

Valkyrie II x5`;

    const res = parseEveClipboard(eft);
    expect(res.format).toBe('eft');
    if (res.format === 'eft') {
      expect(res.shipName).toBe('Gila');
      expect(res.fitName).toBe('Abyssal T5');
      expect(res.lines).toHaveLength(7);
      expect(res.lines[3]).toEqual({ name: 'Multispectrum Shield Hardener II', offline: true });
      expect(res.lines[4]).toEqual({
        name: 'Rapid Light Missile Launcher II',
        charge: 'Scourge Fury Light Missile',
        offline: false
      });
      expect(res.lines[6]).toEqual({ name: 'Valkyrie II', quantity: 5, offline: false });
    }
  });

  it('parses D-Scan tab-separated output with and without typeId', () => {
    const dscan = `17726\tScimitar\tScimitar\t14 km
645\tDominix\tDominix\t2.4 AU
11987\tGuardian\tGuardian\t-`;

    const res = parseEveClipboard(dscan);
    expect(res.format).toBe('dscan');
    if (res.format === 'dscan') {
      expect(res.entries).toHaveLength(3);
      expect(res.entries[0].typeId).toBe(17726);
      expect(res.entries[0].distanceMeters).toBe(14_000);
      expect(res.entries[2].distanceMeters).toBeNull();
    }
  });

  it('parses Cosmic Signatures from probe scanner', () => {
    const sigs = `ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100.0%\t12.4 AU
XYZ-987\tCosmic Signature\tRelic Site\tRuined Sansha Crystal Quarry\t45.2%\t4.1 AU`;

    const res = parseEveClipboard(sigs);
    expect(res.format).toBe('signatures');
    if (res.format === 'signatures') {
      expect(res.entries).toHaveLength(2);
      expect(res.entries[0].sigId).toBe('ABC-123');
      expect(res.entries[0].sigType).toBe('Wormhole');
    }
  });

  it('parses Hangar / Inventory items with comma-formatted quantities', () => {
    const hangar = `Tritanium\t1,250,000\tMineral\tMaterial\t5,000,000 ISK
Pyerite\t450,000\tMineral\tMaterial\t3,200,000 ISK
Drake\t1\tBattlecruiser\tShip`;

    const res = parseEveClipboard(hangar);
    expect(res.format).toBe('hangar');
    if (res.format === 'hangar') {
      expect(res.items).toHaveLength(3);
      expect(res.items[0]).toMatchObject({ name: 'Tritanium', quantity: 1_250_000 });
      expect(res.items[2]).toMatchObject({ name: 'Drake', quantity: 1 });
    }
  });

  it('parses EVE route waypoints', () => {
    const route = `1. Jita (0.9)
2. Perimeter (1.0)
3. Urlen (1.0)`;

    const res = parseEveClipboard(route);
    expect(res.format).toBe('route');
    if (res.format === 'route') {
      expect(res.waypoints.map((w) => w.systemName)).toEqual(['Jita', 'Perimeter', 'Urlen']);
    }
  });

  it('parses Local Chat pilot list', () => {
    const local = `Aura
CCP Hellmar
Chribba`;

    const res = parseEveClipboard(local);
    expect(res.format).toBe('local');
    if (res.format === 'local') {
      expect(res.pilotNames).toEqual(['Aura', 'CCP Hellmar', 'Chribba']);
    }
  });
});

