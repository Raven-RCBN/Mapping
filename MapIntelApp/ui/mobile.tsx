import React, { createContext, useContext, useRef } from "react";
const Screen = createContext<any>(null);
export function NativeShell({ children }: any) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Screen.Provider value={ref}>
      <div ref={ref} className="native-root">
        {children}
      </div>
    </Screen.Provider>
  );
}
export function useScreenPortal() {
  return { screenRef: useContext(Screen) };
}
export function useMobileDevice() {
  return { deviceId: "android", setDeviceId: () => {} };
}
export function useKeyboard() {
  return {
    hide: () => {
      const active = document.activeElement;
      if (!(
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ))
        return;
      (active as HTMLElement).blur();
      (window as any).MapIntelAndroid?.hideKeyboard();
    },
    visible: false,
  };
}
export function useKeyboardInsets() {
  return { bottomInset: 0 };
}
export function MobileScroll({ children, className }: any) {
  return (
    <section className={className}>
      <div className="mobile-scroll">
        <div className="mobile-scroll-content">{children}</div>
      </div>
    </section>
  );
}
export function Carousel({ children, className, ariaLabel }: any) {
  return (
    <div
      className={"native-carousel " + (className || "")}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
export function KeyboardInput(props: any) {
  return (
    <input
      {...props}
      onKeyDown={(e) => {
        props.onKeyDown?.(e);
        if (e.key === "Enter") {
          e.currentTarget.blur();
          (window as any).MapIntelAndroid?.hideKeyboard();
        }
      }}
    />
  );
}
export function BottomSheet({ open, onOpenChange, title, children }: any) {
  return open ? (
    <div className="native-sheet-backdrop" onClick={() => onOpenChange(false)}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="native-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={() => onOpenChange(false)} aria-label="Close panel">
            Close
          </button>
        </header>
        <div className="native-sheet-body">{children}</div>
      </section>
    </div>
  ) : null;
}
