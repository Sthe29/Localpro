export function LiquidBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#F7FAFF] via-[#EBF3FE] to-[#E0EEFC]"
    >
      {/* Subtle architectural radial washes for depth without visual noise */}
      <div className="animate-float-slow absolute -top-36 -left-24 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.16),rgba(191,219,254,0.06)_62%,transparent_75%)] blur-2xl" />
      <div className="animate-float-slower absolute top-[24%] -right-32 h-[580px] w-[580px] rounded-full bg-[radial-gradient(circle_at_center,rgba(13,148,136,0.13),rgba(204,251,241,0.05)_60%,transparent_75%)] blur-2xl" />
      <div className="animate-float-slow absolute -bottom-44 left-[28%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,rgba(11,31,58,0.09),rgba(219,234,254,0.06)_60%,transparent_75%)] blur-2xl" />

      {/* Delicate specular surface sheen across top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
    </div>
  );
}
