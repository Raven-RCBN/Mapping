import React, { Children, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
export default function CompactSelect({
  value,
  onChange,
  children,
  ...props
}: any) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState<any>({});
  const anchor = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null),
    id = useId();
  const options = Children.toArray(children)
    .filter(React.isValidElement)
    .map((child: any) => ({
      value: String(child.props.value ?? child.props.children),
      label: child.props.children,
      disabled: child.props.disabled,
    }));
  const chosen = options.find((o) => o.value === String(value));
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        !anchor.current?.contains(e.target as Node) &&
        !list.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    const resize = () => setOpen(false);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = anchor.current!.getBoundingClientRect(),
      height = Math.min(208, options.length * 38 + 8),
      below = window.innerHeight - r.bottom - 12;
    setPosition({
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      width: r.width,
      top: below >= height ? r.bottom + 4 : Math.max(8, r.top - height - 4),
      maxHeight: height,
    });
    setOpen(true);
  }
  function choose(option: any) {
    if (option.disabled) return;
    onChange?.({
      target: { value: option.value },
      currentTarget: { value: option.value },
    });
    setOpen(false);
    anchor.current?.focus();
  }
  return (
    <>
      <button
        {...props}
        ref={anchor}
        type="button"
        className="compact-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) toggle();
            else {
              const index = options.findIndex((o) => o.value === String(value));
              choose(
                options[
                  (index + (e.key === "ArrowDown" ? 1 : options.length - 1)) %
                    options.length
                ],
              );
            }
          }
        }}
      >
        <span>{chosen?.label ?? "Select"}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            role="listbox"
            className="compact-select-list"
            style={position}
          >
            {options.map((o) => (
              <button
                type="button"
                role="option"
                data-value={o.value}
                aria-selected={o.value === String(value)}
                disabled={o.disabled}
                key={o.value}
                onClick={() => choose(o)}
              >
                <span>{o.label}</span>
                {o.value === String(value) && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
