interface EveLoginButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  compact?: boolean;
}

/**
 * Official-style dark metallic EVE Online SSO button ("EVE | LOG IN with EVE Online").
 */
export function EveLoginButton({
  onClick,
  disabled = false,
  loading = false,
  label = 'LOG IN with EVE Online',
  compact = false
}: EveLoginButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`group relative inline-flex select-none items-center overflow-hidden rounded-[3px] border border-[#44484E] text-white shadow-[0_2px_6px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.14)] transition-all hover:border-[#6A717B] hover:brightness-110 active:translate-y-[0.5px] disabled:cursor-not-allowed disabled:opacity-55 ${
        compact ? 'h-8 text-xs' : 'h-10 text-sm'
      }`}
      style={{
        background: 'linear-gradient(180deg, #35373A 0%, #242628 52%, #18191B 100%)'
      }}
    >
      {/* Left compartment: EVE Wordmark */}
      <span
        className={`flex h-full items-center justify-center border-r border-white/15 ${
          compact ? 'px-2.5' : 'px-3.5'
        }`}
      >
        <svg
          viewBox="0 0 88 22"
          className={compact ? 'h-3.5 w-auto' : 'h-4 w-auto'}
          fill="currentColor"
          aria-label="EVE"
        >
          {/* Left E (3 horizontal bars) */}
          <rect x="0" y="2" width="23" height="3.2" />
          <rect x="0" y="9.4" width="19" height="3.2" />
          <rect x="0" y="16.8" width="23" height="3.2" />
          {/* V */}
          <polygon points="28,2 32.5,2 41.5,16.5 50.5,2 55,2 43.2,20 39.8,20" />
          {/* Right E (3 horizontal bars) */}
          <rect x="60" y="2" width="23" height="3.2" />
          <rect x="60" y="9.4" width="19" height="3.2" />
          <rect x="60" y="16.8" width="23" height="3.2" />
          {/* Registered mark */}
          <circle cx="85.8" cy="3.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="0.7" />
        </svg>
      </span>

      {/* Right compartment: Action Text */}
      <span
        className={`flex h-full items-center font-semibold tracking-tight text-[#F1F5F9] ${
          compact ? 'px-3 text-[12px]' : 'px-4 text-[13.5px]'
        }`}
      >
        {loading ? 'Authorizing in Browser...' : label}
      </span>
    </button>
  );
}

