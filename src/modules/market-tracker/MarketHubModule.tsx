import { useEffect, useState } from 'react';
import { Award, FileText, LineChart, PackageCheck, ShoppingBag } from 'lucide-react';
import type { ModuleProps } from '@shared/types/module';
import { ItemEvaluatorModule } from '@/modules/item-evaluator/ItemEvaluatorModule';
import { LpConversionModule } from '@/modules/lp-conversion/LpConversionModule';
import { MarketTrackerModule } from './MarketTrackerModule';

type MarketHubTab = 'appraisal' | 'market' | 'orders' | 'contracts' | 'lp';

export function MarketHubModule(props: ModuleProps) {
  const [tab, setTab] = useState<MarketHubTab>('appraisal');

  useEffect(() => {
    if (props.incomingClipboard?.format === 'hangar') {
      setTab('appraisal');
    }
  }, [props.incomingClipboard]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-eve-border bg-eve-panel/60 px-4 py-2">
        <button
          type="button"
          onClick={() => setTab('appraisal')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'appraisal'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <PackageCheck className="h-3.5 w-3.5" />
          Item Appraisal
        </button>
        <button
          type="button"
          onClick={() => setTab('market')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'market'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <LineChart className="h-3.5 w-3.5" />
          Market &amp; Investments
        </button>
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'orders'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          Active Orders
        </button>
        <button
          type="button"
          onClick={() => setTab('contracts')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'contracts'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Contracts
        </button>
        <button
          type="button"
          onClick={() => setTab('lp')}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${
            tab === 'lp'
              ? 'border-eve-accent bg-eve-accent-muted text-eve-accent'
              : 'border-eve-border bg-eve-bg text-eve-muted hover:text-eve-text'
          }`}
        >
          <Award className="h-3.5 w-3.5" />
          LP Conversion
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'appraisal' && <ItemEvaluatorModule {...props} />}
        {(tab === 'market' || tab === 'orders' || tab === 'contracts') && (
          <MarketTrackerModule {...props} forcedTab={tab} />
        )}
        {tab === 'lp' && <LpConversionModule {...props} />}
      </div>
    </div>
  );
}

