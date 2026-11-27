import { INJECTOR_BRACKETS } from '@shared/constants/injectors';
import type { CharacterAttributesDto, SkillRequirementNode } from '@shared/types/modules-data';

// SDE dogma attribute IDs for character attributes
const ATTR_CHARISMA = 164;
const ATTR_INTELLIGENCE = 165;
const ATTR_MEMORY = 166;
const ATTR_PERCEPTION = 167;
const ATTR_WILLPOWER = 168;

export interface InjectorPlanResult {
  largeInjectors: number;
  smallInjectors: number;
  totalSpInjected: number;
  leftoverSp: number;
  bracketBreakdown: Array<{
    label: string;
    largeUsed: number;
    smallUsed: number;
    spGained: number;
  }>;
}

export function getAttributeValue(attrs: CharacterAttributesDto, dogmaAttrId: number | null): number {
  switch (dogmaAttrId) {
    case ATTR_CHARISMA:
      return attrs.charisma;
    case ATTR_INTELLIGENCE:
      return attrs.intelligence;
    case ATTR_MEMORY:
      return attrs.memory;
    case ATTR_PERCEPTION:
      return attrs.perception;
    case ATTR_WILLPOWER:
      return attrs.willpower;
    default:
      return 20;
  }
}

export function calculateTrainingMinutes(
  nodes: SkillRequirementNode[],
  attrs: CharacterAttributesDto
): number {
  let totalMinutes = 0;
  for (const node of nodes) {
    if (node.missingSp <= 0) continue;
    const primary = getAttributeValue(attrs, node.primaryAttributeId);
    const secondary = getAttributeValue(attrs, node.secondaryAttributeId);
    const spPerMin = Math.max(1, primary + secondary / 2);
    totalMinutes += node.missingSp / spPerMin;
  }
  return Math.ceil(totalMinutes);
}

export function formatDurationDhm(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0d 0h 0m';
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  return `${days}d ${hours}h ${mins}m`;
}

export function calculateInjectorsNeeded(
  currentTotalSp: number,
  neededSp: number
): InjectorPlanResult {
  if (neededSp <= 0) {
    return {
      largeInjectors: 0,
      smallInjectors: 0,
      totalSpInjected: 0,
      leftoverSp: 0,
      bracketBreakdown: []
    };
  }

  let sp = Math.max(0, currentTotalSp);
  let remaining = neededSp;
  let largeInjectors = 0;
  let smallInjectors = 0;
  let totalSpInjected = 0;

  const breakdownMap = new Map<
    string,
    { label: string; largeUsed: number; smallUsed: number; spGained: number }
  >();

  const bracketLabel = (total: number) => {
    if (total < 5_000_000) return '< 5M SP (500k)';
    if (total < 50_000_000) return '5M – 50M SP (400k)';
    if (total < 80_000_000) return '50M – 80M SP (300k)';
    return '> 80M SP (150k)';
  };

  const getBracket = (total: number) =>
    INJECTOR_BRACKETS.find((b) => total < b.maxSp) ?? INJECTOR_BRACKETS[INJECTOR_BRACKETS.length - 1];

  while (remaining > 0) {
    const bracket = getBracket(sp);
    const label = bracketLabel(sp);
    const entry = breakdownMap.get(label) ?? { label, largeUsed: 0, smallUsed: 0, spGained: 0 };

    if (remaining <= bracket.spPerSmallInjector * 4) {
      // Use Small Skill Injectors if 4 or fewer Smalls cover the remainder cheaper than a Large
      smallInjectors += 1;
      sp += bracket.spPerSmallInjector;
      totalSpInjected += bracket.spPerSmallInjector;
      remaining -= bracket.spPerSmallInjector;
      entry.smallUsed += 1;
      entry.spGained += bracket.spPerSmallInjector;
    } else {
      largeInjectors += 1;
      sp += bracket.spPerLargeInjector;
      totalSpInjected += bracket.spPerLargeInjector;
      remaining -= bracket.spPerLargeInjector;
      entry.largeUsed += 1;
      entry.spGained += bracket.spPerLargeInjector;
    }

    breakdownMap.set(label, entry);
  }

  return {
    largeInjectors,
    smallInjectors,
    totalSpInjected,
    leftoverSp: Math.max(0, totalSpInjected - neededSp),
    bracketBreakdown: Array.from(breakdownMap.values())
  };
}

