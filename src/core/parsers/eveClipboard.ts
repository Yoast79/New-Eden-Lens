import type {
  ParsedClipboard,
  ParsedCosmicSignature,
  ParsedDScanEntry,
  ParsedEftModuleLine,
  ParsedHangarItem,
  ParsedRouteWaypoint
} from '@shared/types/clipboard';

export function parseEveClipboard(rawInput: string): ParsedClipboard {
  const raw = rawInput.replace(/\r\n/g, '\n').trim();
  if (!raw) {
    return { format: 'unknown', raw: '' };
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { format: 'unknown', raw };
  }

  // 1. EFT Ship Fitting: [Ship Name, Fit Name]
  const eftHeader = /^\[([^,\]]+),\s*([^\]]+)\]$/.exec(lines[0].trim());
  if (eftHeader) {
    const parsedLines: ParsedEftModuleLine[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || /^\[Empty\s.+\]$/i.test(line)) continue;

      const offline = /\s+\/OFFLINE$/i.test(line);
      const cleanLine = line.replace(/\s+\/OFFLINE$/i, '').trim();

      const qtyMatch = /^(.+?)\s+x(\d+)$/i.exec(cleanLine);
      if (qtyMatch) {
        parsedLines.push({
          name: qtyMatch[1].trim(),
          quantity: Number(qtyMatch[2]),
          offline
        });
        continue;
      }

      const chargeIdx = cleanLine.indexOf(',');
      if (chargeIdx > 0) {
        parsedLines.push({
          name: cleanLine.slice(0, chargeIdx).trim(),
          charge: cleanLine.slice(chargeIdx + 1).trim(),
          offline
        });
        continue;
      }

      parsedLines.push({ name: cleanLine, offline });
    }

    return {
      format: 'eft',
      shipName: eftHeader[1].trim(),
      fitName: eftHeader[2].trim(),
      lines: parsedLines,
      raw
    };
  }

  // 2. Cosmic Signatures / Anomalies: ABC-123 \t Cosmic Signature \t ...
  if (lines.some((l) => /^[A-Z]{3}-\d{3}\t/.test(l.trim()))) {
    const entries: ParsedCosmicSignature[] = [];
    for (const line of lines) {
      const cols = line.split('\t').map((c) => c.trim());
      if (!/^[A-Z]{3}-\d{3}$/.test(cols[0] ?? '')) continue;
      entries.push({
        sigId: cols[0],
        sigGroup: cols[1] ?? '',
        sigType: cols[2] ?? '',
        name: cols[3] ?? '',
        signalStrength: cols[4] ?? '',
        distance: cols[5] ?? ''
      });
    }
    if (entries.length > 0) {
      return { format: 'signatures', entries, raw };
    }
  }

  // 3. Directional Scan (D-Scan): ends with distance like `1.4 AU`, `250 km`, `1,200 m`, or `-`
  const tabLines = lines.map((l) => l.split('\t').map((c) => c.trim()));
  const looksLikeDScan =
    tabLines.length > 0 &&
    tabLines.every(
      (cols) =>
        (cols.length === 3 || cols.length === 4) &&
        isDistanceToken(cols[cols.length - 1])
    );

  if (looksLikeDScan) {
    const entries: ParsedDScanEntry[] = tabLines.map((cols) => {
      const hasTypeId = cols.length === 4 && /^\d+$/.test(cols[0]);
      const typeId = hasTypeId ? Number(cols[0]) : undefined;
      const name = hasTypeId ? cols[1] : cols[0];
      const typeName = hasTypeId ? cols[2] : cols[1];
      const distanceRaw = cols[cols.length - 1];
      return {
        typeId,
        name,
        typeName,
        distanceRaw,
        distanceMeters: parseDistanceToMeters(distanceRaw)
      };
    });
    return { format: 'dscan', entries, raw };
  }

  // 4. Inventory / Hangar / Contract: `Name \t Quantity` (or `Name \t Qty \t Group...`) or `Name xQty`
  const hangarItems: ParsedHangarItem[] = [];
  for (const cols of tabLines) {
    if (cols.length >= 2) {
      const qty = parseEveNumber(cols[1]);
      if (qty !== null && cols[0].length > 0) {
        hangarItems.push({
          name: cols[0].replace(/\*$/, '').trim(),
          quantity: qty,
          groupName: cols[2] || undefined,
          categoryName: cols[3] || undefined
        });
      } else if (cols[0].length > 0 && cols[1] === '') {
        // Unstacked singleton item in EVE inventory copy
        hangarItems.push({ name: cols[0].replace(/\*$/, '').trim(), quantity: 1 });
      }
    } else if (cols.length === 1) {
      const xMatch = /^(.+?)\s+x([\d,.\s]+)$/i.exec(cols[0]);
      if (xMatch) {
        const qty = parseEveNumber(xMatch[2]);
        if (qty !== null) {
          hangarItems.push({ name: xMatch[1].trim(), quantity: qty });
        }
      }
    }
  }
  if (hangarItems.length > 0 && hangarItems.length >= Math.ceil(lines.length * 0.6)) {
    return { format: 'hangar', items: hangarItems, raw };
  }

  // 5. Route Waypoints (e.g. `1. Jita (0.9)` or `Jita -> Perimeter -> Urlen` or `Jita (0.9)`)
  if (lines.length === 1 && lines[0].includes('->')) {
    const waypoints: ParsedRouteWaypoint[] = lines[0]
      .split('->')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseRouteLine(s))
      .filter((w): w is ParsedRouteWaypoint => w !== null);
    if (waypoints.length >= 2) {
      return { format: 'route', waypoints, raw };
    }
  }

  const routeLines = lines.map(parseRouteLine).filter((w): w is ParsedRouteWaypoint => w !== null);
  if (routeLines.length >= 2 && routeLines.length === lines.length) {
    return { format: 'route', waypoints: routeLines, raw };
  }

  // 6. Local Chat pilot list (newline-separated pilot names, no tabs, <= 38 chars each)
  const pilotLines = lines.map((l) => l.trim());
  const looksLikeLocal =
    pilotLines.length >= 1 &&
    pilotLines.every((p) => !p.includes('\t') && p.length >= 3 && p.length <= 38 && !/[{}[\]<>]/.test(p));

  if (looksLikeLocal) {
    return { format: 'local', pilotNames: Array.from(new Set(pilotLines)), raw };
  }

  return { format: 'unknown', raw };
}

function isDistanceToken(token: string): boolean {
  if (token === '-') return true;
  return /^[\d,.\s]+\s*(m|km|AU)$/i.test(token);
}

export function parseDistanceToMeters(token: string): number | null {
  if (token === '-') return null;
  const match = /^([\d,.\s]+)\s*(m|km|AU)$/i.exec(token);
  if (!match) return null;
  const val = parseEveNumber(match[1]);
  if (val === null) return null;
  const unit = match[2].toLowerCase();
  if (unit === 'm') return val;
  if (unit === 'km') return val * 1_000;
  if (unit === 'au') return val * 149_597_870_700;
  return null;
}

export function parseEveNumber(input: string): number | null {
  const cleaned = input.replace(/[\s\u00A0]/g, '').replace(/,/g, '');
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseRouteLine(line: string): ParsedRouteWaypoint | null {
  const m = /^(?:\d+\.\s*)?([A-Za-z0-9\- ]+?)\s*\((-?\d+\.\d+)\)(?:.*)?$/.exec(line.trim());
  if (!m) return null;
  return {
    systemName: m[1].trim(),
    security: Number(m[2])
  };
}

