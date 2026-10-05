// The product name. ALWAYS render the brand through this so "StageRight" is
// consistently differentiated from the surrounding copy — the display serif
// (the "fancy" font) at a slightly larger size. Colour is inherited so it
// works on any background. Use inline: <>… <Brand /> stages it …</>
export function Brand() {
  return (
    <span className="font-display text-[1.08em] tracking-[-0.01em]">StageRight</span>
  );
}
