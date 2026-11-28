import type { ModuleDefinition } from '@shared/types/module';
import { assetsBrowserModule } from './assets-browser';
import { fleetPlannerModule } from './fleet-planner';
import { killboardModule } from './killboard';
import { localIntelModule } from './local-intel';
import { marketTrackerModule } from './market-tracker';
import { intelTrackerModule } from './intel-tracker';
import { pilotAnalyticsModule } from './pilot-analytics';
import { shipFitterModule } from './ship-fitter';
import { skillPlannerModule } from './skill-planner';
import { structureTimersModule } from './structure-timers';
import { tacticalMapModule } from './tactical-map';
import { wormholeMapperModule } from './wormhole-mapper';
import { miningTrackerModule } from './mining-tracker';
import { industryCalculatorModule } from './industry-calculator';
import { planetaryInteractionModule } from './planetary-interaction';

export const MODULE_REGISTRY: readonly ModuleDefinition[] = Object.freeze([
  marketTrackerModule,
  skillPlannerModule,
  tacticalMapModule,
  localIntelModule,
  intelTrackerModule,
  killboardModule,
  structureTimersModule,
  shipFitterModule,
  fleetPlannerModule,
  assetsBrowserModule,
  pilotAnalyticsModule,
  wormholeMapperModule,
  planetaryInteractionModule,
  miningTrackerModule,
  industryCalculatorModule
]);

export function getModuleById(id: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}
