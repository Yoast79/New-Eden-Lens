import { useEffect, useState } from 'react';
import { Calculator, GraduationCap, Sparkles } from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import { SkillMonitorModule } from '@/modules/skill-monitor/SkillMonitorModule';
import { createWipComponent } from '@/modules/shared/WorkInProgressModule';
import { SkillPlannerModule } from './SkillPlannerModule';

const SpFarmingPanel = createWipComponent({
  title: 'Skillpoint Farming',
  description: 'Track SP farm characters, extractor timers, and net ISK profit per account.',
  icon: Sparkles,
  plannedFeatures: [
    'Monitor 5.5M+ SP thresholds and queued extractor dates across all accounts',
    'Calculate live Large Skill Injector vs Skill Extractor + PLEX margins',
    'Track implant/remaps and SP/hour efficiency per farm slot'
  ]
});

export function SkillsHubModule(props: ModuleProps) {
  const [tab, setTab] = useState<'monitor' | 'planner' | 'farming'>('monitor');

  // Auto-switch to Planner if user pastes an EFT fit
  useEffect(() => {
    if (props.incomingClipboard?.format === 'eft') {
      setTab('planner');
    }
  }, [props.incomingClipboard]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-eve-border bg-eve-panel/60 px-4 py-2">
        <button
          type="button"
          onClick={() => setTab('monitor')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'monitor'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <GraduationCap className="h-3.5 w-3.5" />
          Skill Monitor &amp; Queue
        </button>
        <button
          type="button"
          onClick={() => setTab('planner')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'planner'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <Calculator className="h-3.5 w-3.5" />
          Skill &amp; Injector Planner
        </button>
        <button
          type="button"
          onClick={() => setTab('farming')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'farming'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          SP Farming (WIP)
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'monitor' && <SkillMonitorModule {...props} />}
        {tab === 'planner' && <SkillPlannerModule {...props} />}
        {tab === 'farming' && <SpFarmingPanel />}
      </div>
    </div>
  );
}
