"use client";

import { useEffect, useState } from "react";

import { ROUTES } from "@/lib/routes";

const LINKS = [
  { href: "/#alur", label: "Cara kerja" },
  { href: "/#harga", label: "Harga" },
  { href: "/#tanya", label: "Tanya jawab" },
  { href: ROUTES.login, label: "Masuk" },
];

const linkStyle = {
  display: "flex",
  alignItems: "center",
  minHeight: 48,
  textDecoration: "none",
  fontSize: 17,
} as const;

/** Menu HP: tombol 44px plus panel. Panel diposisikan absolut di bawah masthead. */
export function MastheadMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="menu-btn"
        aria-expanded={open}
        aria-controls="menu-hp"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 44,
          height: 44,
          marginLeft: -10,
          alignItems: "center",
          justifyContent: "center",
          border: 0,
          borderRadius: "var(--radius-card)",
          background: "transparent",
          color: "var(--color-ink)",
          cursor: "pointer",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <nav
        id="menu-hp"
        className="menu-panel"
        data-open={open}
        aria-label="Menu HP"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "100%",
          zIndex: 10,
          flexDirection: "column",
          padding: "var(--space-sm) clamp(20px, 4vw, 48px)",
          background: "var(--color-paper)",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)} style={linkStyle}>
            {l.label}
          </a>
        ))}
      </nav>
    </>
  );
}
