// Shared dark page: sets the page colour + dark class, and renders the moving mesh behind everything.
import { useEffect } from "react";
import { createPortal } from "react-dom";

export interface DarkTheme { page: string; mesh: [string, string, string, string] }

export function DarkPage({ theme }: { theme: DarkTheme }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--page-tint", theme.page);
    root.classList.add("dark-page");
    return () => { root.style.removeProperty("--page-tint"); root.classList.remove("dark-page"); };
  }, [theme.page]);
  const [m1, m2, m3, m4] = theme.mesh;
  return createPortal(
    <div className="mesh" aria-hidden style={{ ["--m1" as string]: m1, ["--m2" as string]: m2, ["--m3" as string]: m3, ["--m4" as string]: m4 }}>
      <span className="b1" /><span className="b2" /><span className="b3" /><span className="b4" /><i className="grain" />
    </div>,
    document.body,
  );
}
