import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom implements none of the pointer-capture API and has no PointerEvent, so
// any Radix component that opens on a pointer press — dropdowns, selects,
// popovers — silently never opens under test. These four stubs are what the
// whole family needs; without them a menu can only be driven by keyboard.
if (!("PointerEvent" in window)) {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// jsdom has no layout, so it implements no scrolling: window.scrollTo logs a
// "Not implemented" error through the virtual console rather than throwing.
// Nothing fails, but the noise buries real output, and code under test is
// entitled to ask the window to scroll.
window.scrollTo = (() => {}) as typeof window.scrollTo;
