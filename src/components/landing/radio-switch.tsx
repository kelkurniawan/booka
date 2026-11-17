import type { ReactNode } from "react";

/**
 * Pemilih tanpa JS: radio asli di dalam fieldset (panah keyboard bawaan).
 * Panel ditukar CSS `[data-switch]:has(...)`; bungkus RadioSwitch dan
 * SwitchPanel dengan elemen ber-atribut `data-switch`.
 */
export function RadioSwitch({
  name,
  legend,
  options,
  defaultIndex = 0,
  tone = "paper",
  className,
}: {
  name: string;
  legend: string;
  options: readonly string[];
  defaultIndex?: number;
  tone?: "paper" | "board";
  className?: string;
}) {
  if (options.length > 4) throw new Error("RadioSwitch: maksimal empat opsi (CSS pemilih)");
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} className={className}>
      <legend className="sr-only">{legend}</legend>
      <div className={tone === "board" ? "groove groove--board" : "groove"}>
        {options.map((label, i) => (
          <label key={label}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={i}
              defaultChecked={i === defaultIndex}
              data-switch-input
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SwitchPanel({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-panel={index} className={className}>
      {children}
    </div>
  );
}
