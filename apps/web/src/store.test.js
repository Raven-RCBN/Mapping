import test from "node:test";
import assert from "node:assert/strict";
import {
  atlasReducer,
  loaded,
  patch,
  select,
  workspaceLoaded,
  assetsLoaded,
  rowsLoaded,
  estateLoadFailed,
  estateMapReady,
} from "./store.js";

const snapshot = {
  paged: true,
  offline: false,
  refresh: 1,
  access: { subject: "test" },
  estates: [
    { id: "sg", blockCount: 25 },
    { id: "oban", blockCount: 239 },
  ],
  activities: [],
  blocks: [],
  sources: [],
  assets: [],
};
const start = () => atlasReducer(undefined, loaded(snapshot));
const response = (estateId, refresh = 1) => ({ estateId, refresh });
const workspace = (estateId, refresh = 1) =>
  workspaceLoaded({
    ...response(estateId, refresh),
    data: {
      estates: [
        {
          id: estateId,
          boundary: {
            type: "FeatureCollection",
            features: [{ properties: { blockName: estateId } }],
          },
        },
      ],
      blocks: [{ id: estateId + "-block", estateId }],
      sources: [],
    },
  });
const assets = (estateId, refresh = 1) =>
  assetsLoaded({
    ...response(estateId, refresh),
    data: [{ id: estateId + "-image", estateId }],
  });
const rows = (estateId, refresh = 1) =>
  rowsLoaded({
    ...response(estateId, refresh),
    patch: {
      mapRows: [{ id: estateId + "-record", estateId }],
      mapLoading: false,
      dashboard: { summary: { count: 1 } },
    },
  });
const ready = () =>
  [workspace("sg"), assets("sg"), rows("sg")].reduce(atlasReducer, start());

test("applying the same estate preserves the loaded map, activities and filters", () => {
  const state = atlasReducer(
    ready(),
    patch({ selectedBlock: "sg::A", override: "sg-image", base: "satellite" })
  );
  assert.equal(estateMapReady(state), true);
  assert.strictEqual(atlasReducer(state, select(["sg"])), state);
});

test("switching estates waits for that estate's workspace, assets and activities in any response order", () => {
  let state = atlasReducer(ready(), select(["oban"]));
  assert.equal(estateMapReady(state), false);
  assert.deepEqual(state.mapRows, []);
  assert.deepEqual(state.mapAssets, []);
  state = atlasReducer(state, rows("oban"));
  assert.equal(estateMapReady(state), false);
  state = atlasReducer(state, assets("oban"));
  assert.equal(estateMapReady(state), false);
  state = atlasReducer(state, workspace("oban"));
  assert.equal(estateMapReady(state), true);
  assert.equal(
    state.data.estates.find((e) => e.id === "sg").boundary,
    undefined
  );
  assert.equal(state.data.blocks[0].estateId, "oban");
});

test("late responses and errors cannot overwrite the newly selected estate", () => {
  const state = atlasReducer(ready(), select(["oban"]));
  for (const action of [
    workspace("sg"),
    assets("sg"),
    rows("sg"),
    estateLoadFailed({ ...response("sg"), message: "old request" }),
  ]) {
    assert.strictEqual(atlasReducer(state, action), state);
  }
  const refreshed = atlasReducer(state, loaded({ ...snapshot, refresh: 2 }));
  for (const action of [workspace("oban"), assets("oban"), rows("oban")]) {
    assert.strictEqual(atlasReducer(refreshed, action), refreshed);
  }
});

test("switching back must load that estate again; offline maps need no online readiness flags", () => {
  let state = atlasReducer(ready(), select(["oban"]));
  state = atlasReducer(state, select(["sg"]));
  assert.equal(estateMapReady(state), false);
  state = [assets("sg"), workspace("sg"), rows("sg")].reduce(
    atlasReducer,
    state
  );
  assert.equal(estateMapReady(state), true);
  const offline = atlasReducer(
    undefined,
    loaded({ ...snapshot, offline: true, paged: false })
  );
  assert.equal(estateMapReady(offline), true);
});
