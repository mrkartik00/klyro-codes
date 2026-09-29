// Stylised browser-window preview for a project (no screenshots needed).
// Pure CSS so it's crisp at any size and costs nothing to load.
export function ProjectPreview({ project, className = '' }) {
  const { hue, domain, name, category } = project;
  return (
    <div className={`browser-frame ${className}`} aria-hidden="true">
      <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
        <span className="ml-3 flex flex-1 items-center gap-2 truncate rounded-md bg-white/5 px-3 py-1 text-[11px] text-white/45">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="2" />
          </svg>
          {domain}
        </span>
      </div>

      <div
        className="@container relative aspect-[16/10] overflow-hidden transition-transform duration-700 ease-out group-hover:scale-[1.035]"
        style={{
          background: `radial-gradient(110% 80% at 90% 0%, ${hue}45 0%, transparent 55%), radial-gradient(70% 70% at 0% 100%, ${hue}20 0%, transparent 60%), #0b0b10`,
        }}
      >
        {/* app nav */}
        <div className="flex items-center justify-between px-[6%] pt-[5%]">
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-md" style={{ background: hue }} />
            <span className="font-heading text-[11px] font-semibold text-white/85">{name}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-8 rounded-full bg-white/15" />
            <span className="h-1.5 w-8 rounded-full bg-white/15" />
            <span className="h-1.5 w-8 rounded-full bg-white/15" />
            <span className="ml-1 h-4 w-12 rounded-full" style={{ background: hue }} />
          </span>
        </div>

        <div className="grid grid-cols-[1.1fr_1fr] gap-[5%] px-[6%] pt-[7%]">
          {/* hero copy */}
          <div>
            <span className="text-[9px] tracking-[0.18em] uppercase" style={{ color: hue }}>
              {category}
            </span>
            <span className="mt-3 block h-3.5 w-[95%] rounded bg-white/80" />
            <span className="mt-2 block h-3.5 w-[70%] rounded bg-white/80" />
            <span className="mt-4 block h-1.5 w-full rounded bg-white/15" />
            <span className="mt-1.5 block h-1.5 w-[85%] rounded bg-white/15" />
            <span className="mt-1.5 block h-1.5 w-[60%] rounded bg-white/15" />
            <span className="mt-5 flex gap-2">
              <span className="h-5 w-20 rounded-full" style={{ background: hue }} />
              <span className="h-5 w-16 rounded-full border border-white/20" />
            </span>
          </div>

          {/* hero visual: floating dashboard card */}
          <div className="relative">
            <div
              className="absolute -top-2 right-0 h-[88%] w-[92%] rounded-xl border border-white/10 p-3 shadow-2xl"
              style={{ background: `linear-gradient(160deg, ${hue}30, #13131a 60%)` }}
            >
              <span className="block h-1.5 w-10 rounded bg-white/30" />
              <span className="mt-2 block font-heading text-sm font-semibold text-white/90">
                {Math.round(40 + (name.length * 7) % 55)}%
              </span>
              <svg viewBox="0 0 100 40" className="mt-2 w-full" preserveAspectRatio="none">
                <path
                  d="M0 32 L15 26 L30 29 L45 18 L60 21 L75 10 L100 6"
                  fill="none"
                  stroke={hue}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path d="M0 32 L15 26 L30 29 L45 18 L60 21 L75 10 L100 6 L100 40 L0 40Z" fill={hue} opacity="0.15" />
              </svg>
            </div>
            <div className="absolute bottom-0 -left-3 hidden w-[55%] @min-[440px]:block rounded-lg border border-white/10 bg-[#16161e]/95 p-2.5 shadow-xl">
              <span className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full" style={{ background: `${hue}55` }} />
                <span className="flex-1">
                  <span className="block h-1.5 w-full rounded bg-white/30" />
                  <span className="mt-1 block h-1.5 w-2/3 rounded bg-white/15" />
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* stat row */}
        <div className="absolute right-[6%] bottom-[6%] left-[6%] hidden grid-cols-3 gap-3 @min-[440px]:grid">
          {[0.9, 0.6, 0.75].map((h, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.04] p-2.5">
              <span className="block h-1.5 w-8 rounded bg-white/15" />
              <div className="mt-2 flex h-7 items-end gap-1">
                {[0.4, 0.7, h, 0.5, 0.85].map((v, j) => (
                  <span
                    key={j}
                    className="flex-1 rounded-sm"
                    style={{ height: `${v * 100}%`, background: j === 2 ? hue : 'rgba(255,255,255,0.12)' }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ProjectPreview;
