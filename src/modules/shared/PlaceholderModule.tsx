import type { ModuleProps } from '@shared/types/module';
import type { ClipboardFormat } from '@shared/types/clipboard';
import { ClipboardCheck, ShieldAlert, Wrench } from 'lucide-react';

interface BlueprintConfig {
  title: string;
  phase: string;
  summary: string;
  capabilities: string[];
  requiredScopes: string[];
  acceptedFormats: ClipboardFormat[];
}

export function createPlaceholderModuleView(config: BlueprintConfig) {
  return function PlaceholderModuleView({ activeCharacterId, incomingClipboard }: ModuleProps) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="photon-panel">
            <div className="photon-header flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <Wrench className="h-4 w-4 text-eve-accent" />
                <span className="text-sm font-semibold tracking-wide uppercase">{config.title}</span>
              </div>
              <span className="border border-eve-accent/40 bg-eve-accent-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-eve-accent">
                {config.phase}
              </span>
            </div>

            <div className="space-y-4 p-4">
              <p className="text-sm text-eve-muted leading-relaxed">{config.summary}</p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="border border-eve-border bg-eve-bg/60 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-eve-accent">
                    Planned Capabilities
                  </div>
                  <ul className="space-y-1.5 text-xs text-eve-text">
                    {config.capabilities.map((cap) => (
                      <li key={cap} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 bg-eve-accent" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3 border border-eve-border bg-eve-bg/60 p-3">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-eve-warning">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Required ESI Scopes
                    </div>
                    {config.requiredScopes.length === 0 ? (
                      <span className="text-xs text-eve-muted">No private character scopes required (public ESI / local SDE).</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {config.requiredScopes.map((scope) => (
                          <code
                            key={scope}
                            className="border border-eve-border bg-eve-panel px-1.5 py-0.5 font-mono text-[11px] text-eve-text"
                          >
                            {scope}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-eve-muted">
                      <ClipboardCheck className="h-3.5 w-3.5 text-eve-accent" />
                      Clipboard Formats
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {config.acceptedFormats.length === 0 ? (
                        <span className="text-xs text-eve-muted">None</span>
                      ) : (
                        config.acceptedFormats.map((fmt) => (
                          <span
                            key={fmt}
                            className="border border-eve-border-strong bg-eve-elevated px-2 py-0.5 text-[11px] uppercase tracking-wider text-eve-accent"
                          >
                            {fmt}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-eve-border pt-3 text-xs text-eve-muted">
                <span>
                  Context:{' '}
                  <strong className="text-eve-text">
                    {activeCharacterId === null ? 'All Characters / Unlinked' : `Character #${activeCharacterId}`}
                  </strong>
                </span>
                {incomingClipboard && incomingClipboard.format !== 'unknown' && (
                  <span className="text-eve-accent">
                    Detected clipboard payload: <strong className="uppercase">{incomingClipboard.format}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
}

