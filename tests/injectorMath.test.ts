import { describe, expect, it } from 'vitest';
import {
  calculateInjectorsNeeded,
  calculateTrainingMinutes,
  formatDurationDhm
} from '@/modules/skill-planner/injectorMath';

describe('injectorMath', () => {
  it('applies diminishing returns accurately across the 5M SP bracket boundary', () => {
    // At 4.7M SP, 1st Large Injector gives 500k (bringing pilot to 5.2M SP).
    // Next SP needed (600k remaining) falls into 5M-50M bracket (400k per Large).
    const plan = calculateInjectorsNeeded(4_700_000, 1_100_000);
    expect(plan.largeInjectors).toBe(2);
    expect(plan.smallInjectors).toBe(3); // 500k + 400k + 3*80k = 1,140,000 SP
    expect(plan.totalSpInjected).toBe(1_140_000);
    expect(plan.leftoverSp).toBe(40_000);
  });

  it('uses 150k per Large Injector above 80M SP', () => {
    const plan = calculateInjectorsNeeded(85_000_000, 450_000);
    expect(plan.largeInjectors).toBe(3);
    expect(plan.smallInjectors).toBe(0);
    expect(plan.totalSpInjected).toBe(450_000);
  });

  it('calculates attribute-based training time and D/H/M formatting', () => {
    const mins = calculateTrainingMinutes(
      [
        {
          skillId: 3300,
          skillName: 'Gunnery',
          rank: 1,
          primaryAttributeId: 167, // Perception (24)
          secondaryAttributeId: 168, // Willpower (20) => 24 + 10 = 34 SP/min
          requiredLevel: 5,
          trainedLevel: 4,
          currentSp: 45255,
          requiredSp: 256000,
          missingSp: 210745
        }
      ],
      { charisma: 19, intelligence: 20, memory: 20, perception: 24, willpower: 20 }
    );
    expect(mins).toBe(Math.ceil(210745 / 34));
    expect(formatDurationDhm(6199)).toBe('4d 7h 19m');
  });
});

