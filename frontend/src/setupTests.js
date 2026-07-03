import { TextEncoder, TextDecoder } from "util";
import "@testing-library/jest-dom";

// react-router v7 needs TextEncoder/TextDecoder, which the jsdom version
// bundled with react-scripts' Jest doesn't provide.
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

// framer-motion's `whileInView` (used on the Landing page) relies on
// IntersectionObserver, which jsdom does not implement.
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
