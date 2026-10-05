/**
 * Wrapper for landing pages — applies the architectural-blueprint background,
 * fixed depth-blob parallax layer, and the technical title block in the
 * bottom-right corner.
 *
 * The actual styles live in globals.css under `.landing-shell`. Scoping the
 * design system this way keeps the dashboard / wizard / admin surfaces
 * untouched: the sr-* tokens and blueprint chrome only render inside this
 * wrapper.
 *
 * The title block is purely decorative (aria-hidden) and self-hides on
 * viewports under 720px.
 */
export function LandingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-shell">
      <div className="sr-depth" aria-hidden="true">
        <div className="sr-depth-blob sage" />
        <div className="sr-depth-blob timber" />
        <div className="sr-depth-blob terra" />
      </div>

      {children}
    </div>
  );
}
