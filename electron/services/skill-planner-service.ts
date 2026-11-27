import type {
  CharacterAttributesDto,
  ImplantDetailDto,
  SkillMonitorDto,
  SkillRequirementNode
} from '@shared/types/modules-data';
import type { LocalDatabase } from '../db/connection';
import type { CharacterRepository } from '../db/repositories/characterRepo';
import type { EsiClient } from './esi-client';

const REQ_SKILL_ATTRS: Array<[number, number]> = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288]
];

const ATTR_PRIMARY = 180;
const ATTR_SECONDARY = 181;
const ATTR_RANK = 275;

export function skillPointsForLevel(rank: number, level: number): number {
  if (level <= 0) return 0;
  return Math.ceil(250 * rank * Math.pow(32, (level - 1) / 2));
}

export class SkillPlannerService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly characterRepo: CharacterRepository,
    private readonly esiClient: EsiClient
  ) {}

  async syncCharacterAttributesAndImplants(characterId: number): Promise<{
    attributes: CharacterAttributesDto;
    implants: ImplantDetailDto[];
  }> {
    const [attrs, implantIds] = await Promise.all([
      this.esiClient
        .request<CharacterAttributesDto>(`/characters/${characterId}/attributes`, { characterId })
        .catch(() => ({
          charisma: 20,
          intelligence: 20,
          memory: 20,
          perception: 20,
          willpower: 20
        })),
      this.esiClient
        .request<number[]>(`/characters/${characterId}/implants`, { characterId })
        .catch(() => [] as number[])
    ]);

    this.db.run('UPDATE characters SET attributes_json = ? WHERE character_id = ?', [
      JSON.stringify(attrs),
      characterId
    ]);

    const implants: ImplantDetailDto[] = implantIds.map((typeId) => {
      const typeRow = this.db.get<{ type_name: string }>(
        'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
        [typeId]
      );
      const dogma = this.getTypeDogmaMap(typeId);
      return {
        typeId,
        name: typeRow?.type_name ?? `Implant #${typeId}`,
        slot: dogma.has(331) ? Math.round(dogma.get(331)!) : null,
        bonuses: {
          charisma: dogma.get(175) ?? 0,
          intelligence: dogma.get(176) ?? 0,
          memory: dogma.get(177) ?? 0,
          perception: dogma.get(178) ?? 0,
          willpower: dogma.get(179) ?? 0
        }
      };
    });

    implants.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
    return { attributes: attrs, implants };
  }

  resolveSkillRequirements(
    targets: Array<{ typeId: number; targetLevel?: number }>,
    characterId: number | null
  ): SkillRequirementNode[] {
    const requiredLevels = new Map<number, number>();
    const queue: Array<{ typeId: number; targetLevel?: number }> = [...targets];
    const visitedItemTypes = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const visitKey = `${current.typeId}:${current.targetLevel ?? 0}`;
      if (visitedItemTypes.has(visitKey)) continue;
      visitedItemTypes.add(visitKey);

      const typeInfo = this.db.get<{ category_id: number | null; type_name: string }>(
        `SELECT g.category_id, t.type_name
         FROM sde_inv_types t
         LEFT JOIN sde_inv_groups g ON g.group_id = t.group_id
         WHERE t.type_id = ?`,
        [current.typeId]
      );

      // Category 16 is Skill
      if (typeInfo?.category_id === 16 && current.targetLevel) {
        const prev = requiredLevels.get(current.typeId) ?? 0;
        if (current.targetLevel > prev) {
          requiredLevels.set(current.typeId, Math.min(5, Math.max(1, current.targetLevel)));
        }
      }

      const attrs = this.getTypeDogmaMap(current.typeId);
      for (const [skillAttrId, levelAttrId] of REQ_SKILL_ATTRS) {
        const reqSkillId = attrs.get(skillAttrId);
        if (!reqSkillId) continue;
        const reqLevel = Math.min(5, Math.max(1, Math.round(attrs.get(levelAttrId) ?? 1)));
        const prev = requiredLevels.get(reqSkillId) ?? 0;
        if (reqLevel > prev) {
          requiredLevels.set(reqSkillId, reqLevel);
        }
        queue.push({ typeId: reqSkillId, targetLevel: reqLevel });
      }
    }

    const trainedMap = new Map<number, { level: number; sp: number }>();
    if (characterId !== null) {
      const charSkills = this.characterRepo.getCharacterSkills(characterId);
      for (const s of charSkills.skills) {
        trainedMap.set(s.skillId, { level: s.trainedSkillLevel, sp: s.skillpointsInSkill });
      }
    }

    const nodes: SkillRequirementNode[] = [];
    for (const [skillId, reqLevel] of requiredLevels.entries()) {
      const typeRow = this.db.get<{ type_name: string }>(
        'SELECT type_name FROM sde_inv_types WHERE type_id = ?',
        [skillId]
      );
      const dogma = this.getTypeDogmaMap(skillId);
      const rank = dogma.get(ATTR_RANK) ?? 1;
      const primaryAttributeId = dogma.get(ATTR_PRIMARY) ?? null;
      const secondaryAttributeId = dogma.get(ATTR_SECONDARY) ?? null;

      const trained = trainedMap.get(skillId);
      const trainedLevel = trained?.level ?? 0;
      const currentSp = trained?.sp ?? 0;
      const reqSp = skillPointsForLevel(rank, reqLevel);
      const missingSp = trainedLevel >= reqLevel ? 0 : Math.max(0, reqSp - currentSp);

      nodes.push({
        skillId,
        skillName: typeRow?.type_name ?? `Skill #${skillId}`,
        rank,
        primaryAttributeId,
        secondaryAttributeId,
        requiredLevel: reqLevel,
        trainedLevel,
        currentSp,
        requiredSp: reqSp,
        missingSp
      });
    }

    return nodes.sort((a, b) => b.missingSp - a.missingSp || a.skillName.localeCompare(b.skillName));
  }

  private getTypeDogmaMap(typeId: number): Map<number, number> {
    const rows = this.db.all<{ attribute_id: number; value: number }>(
      'SELECT attribute_id, value FROM sde_type_dogma_attributes WHERE type_id = ?',
      [typeId]
    );
    return new Map(rows.map((r) => [r.attribute_id, r.value]));
  }

  async getSkillMonitor(characterId: number): Promise<SkillMonitorDto> {
    interface EsiSkillQueueRow {
      queue_position: number;
      skill_id: number;
      finished_level: number;
      training_start_sp?: number;
      level_start_sp?: number;
      level_end_sp?: number;
      start_date?: string;
      finish_date?: string;
    }
    interface EsiSkillsRes {
      skills: Array<{
        skill_id: number;
        active_skill_level: number;
        trained_skill_level: number;
        skillpoints_in_skill: number;
      }>;
      total_sp: number;
      unallocated_sp?: number;
    }

    const [{ attributes, implants }, rawQueue, rawSkills] = await Promise.all([
      this.syncCharacterAttributesAndImplants(characterId),
      this.esiClient
        .request<EsiSkillQueueRow[]>(`/characters/${characterId}/skillqueue`, { characterId })
        .catch(() => []),
      this.esiClient
        .request<EsiSkillsRes>(`/characters/${characterId}/skills`, { characterId })
        .catch(() => null)
    ]);

    if (rawSkills && Array.isArray(rawSkills.skills)) {
      this.characterRepo.saveSkills(
        characterId,
        rawSkills.total_sp ?? 0,
        rawSkills.unallocated_sp ?? 0,
        rawSkills.skills
      );
    }

    const charSkills = this.characterRepo.getCharacterSkills(characterId);
    const trainedMap = new Map(charSkills.skills.map((s) => [s.skillId, s]));

    const catalogRows = this.db.all<{
      type_id: number;
      type_name: string;
      group_name: string;
      rank: number | null;
    }>(
      `SELECT t.type_id, t.type_name, g.group_name,
              (SELECT d.value FROM sde_type_dogma_attributes d WHERE d.type_id = t.type_id AND d.attribute_id = 275 LIMIT 1) AS rank
       FROM sde_inv_types t
       JOIN sde_inv_groups g ON g.group_id = t.group_id
       WHERE g.category_id = 16 AND t.published = 1
       ORDER BY g.group_name ASC, t.type_name ASC`
    );

    const catalogMap = new Map(catalogRows.map((r) => [r.type_id, r]));
    const trainingMap = new Map<number, number>();
    for (const q of rawQueue) {
      if (!trainingMap.has(q.skill_id)) {
        trainingMap.set(q.skill_id, q.finished_level);
      }
    }

    const queue = [...rawQueue]
      .sort((a, b) => a.queue_position - b.queue_position)
      .map((q) => {
        const meta = catalogMap.get(q.skill_id);
        return {
          queuePosition: q.queue_position,
          skillId: q.skill_id,
          skillName: meta?.type_name ?? `Skill #${q.skill_id}`,
          groupName: meta?.group_name ?? 'Skill',
          finishedLevel: q.finished_level,
          trainingStartSp: q.training_start_sp ?? 0,
          levelStartSp: q.level_start_sp ?? 0,
          levelEndSp: q.level_end_sp ?? 0,
          startDate: q.start_date ?? null,
          finishDate: q.finish_date ?? null
        };
      });

    const skills = catalogRows.map((c) => {
      const tr = trainedMap.get(c.type_id);
      return {
        skillId: c.type_id,
        skillName: c.type_name,
        groupName: c.group_name,
        rank: c.rank ?? 1,
        trainedLevel: tr?.trainedSkillLevel ?? 0,
        activeLevel: tr?.activeSkillLevel ?? 0,
        skillpointsInSkill: tr?.skillpointsInSkill ?? 0,
        isTraining: trainingMap.has(c.type_id),
        trainingToLevel: trainingMap.get(c.type_id) ?? null
      };
    });

    return {
      characterId,
      totalSp: charSkills.totalSp,
      unallocatedSp: charSkills.unallocatedSp,
      attributes,
      implants,
      queue,
      skills
    };
  }
}

