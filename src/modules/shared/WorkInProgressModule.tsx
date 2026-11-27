import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

interface WorkInProgressModuleProps {
  title: string;
  description: string;
  icon: LucideIcon;
  plannedFeatures: string[];
}

export function createWipComponent(props: WorkInProgressModuleProps) {
  return function WipView() {
    return <WorkInProgressModule {...props} />;
  };
}

export function WorkInProgressModule({
  title,
  description,
  icon: Icon,
  plannedFeatures
}: WorkInProgressModuleProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="photon-panel w-full max-w-lg space-y-4 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center border border-eve-accent/50 bg-eve-accent-muted text-eve-accent">
          <Icon className="h-6 w-6" />
        </div>

        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 border border-eve-warning/60 bg-eve-warning/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-eve-warning">
            <Construction className="h-3 w-3" />
            Work In Progress
          </div>
          <h2 className="text-base font-bold uppercase tracking-wider text-eve-text">{title}</h2>
          <p className="text-xs text-eve-muted">{description}</p>
        </div>

        <div className="border border-eve-border bg-eve-bg/60 p-3 text-left">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-eve-accent">
            Planned Capabilities
          </div>
          <ul className="list-disc space-y-1 pl-4 text-xs text-eve-muted">
            {plannedFeatures.map((feat, idx) => (
              <li key={idx}>{feat}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
