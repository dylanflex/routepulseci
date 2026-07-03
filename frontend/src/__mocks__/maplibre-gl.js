// Manual mock for maplibre-gl (auto-applied by Jest for all test files —
// see https://jestjs.io/docs/manual-mocks#mocking-node-modules). A real
// WebGL map can't render in jsdom, so tests get a lightweight stand-in
// instead of chasing missing browser APIs one at a time.

class MockMap {
  constructor() {
    this._listeners = {};
  }
  addControl() {
    return this;
  }
  on(event, callback) {
    this._listeners[event] = callback;
    if (event === "load") setTimeout(callback, 0);
    return this;
  }
  addSource() {}
  addLayer() {}
  getSource() {
    return undefined;
  }
  remove() {}
}

class MockMarker {
  setLngLat() {
    return this;
  }
  addTo() {
    return this;
  }
  remove() {}
}

class MockNavigationControl {}

module.exports = {
  Map: MockMap,
  Marker: MockMarker,
  NavigationControl: MockNavigationControl,
};
