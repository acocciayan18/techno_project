import '@testing-library/jest-dom/vitest';

// jsdom lacks a few browser APIs the photo UI touches. Stub the minimum.
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
