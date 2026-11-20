import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };

/** Shared Open Graph image layout: brand mark, a title and a line of text, in the dark theme. */
export function ogImage({ title, subtitle, eyebrow }: { title: string; subtitle: string; eyebrow: string }) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#0b0d12",
        color: "#e8eaf0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 28 28" fill="none">
          <path d="M14 2 25 8v12L14 26 3 20V8z" stroke="#5b9bff" strokeWidth="2" />
          <path d="M9.5 14.5l3 3 6-7" stroke="#5b9bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: 4 }}>CRYPY</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span style={{ fontSize: 28, color: "#5b9bff", textTransform: "uppercase", letterSpacing: 3 }}>{eyebrow}</span>
        <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>{title}</span>
        <span style={{ fontSize: 32, color: "#9aa3b5", lineHeight: 1.35 }}>{subtitle}</span>
      </div>
      <span style={{ fontSize: 26, color: "#9aa3b5" }}>crypy.org</span>
    </div>,
    ogSize,
  );
}
