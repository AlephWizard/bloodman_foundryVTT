import assert from "node:assert/strict";
import { createActorSheetLayoutRules } from "../../src/ui/actor-sheet-layout.mjs";

async function run() {
  const rules = createActorSheetLayoutRules();

  assert.equal(
    rules.resolveAutoResizeKey({
      activeTab: " equipement ",
      itemCounts: { total: 7, aptitudes: 1, pouvoirs: 2, carried: 3 },
      transportCount: 2.9
    }),
    "equipement|7|1|2|3|2"
  );
  assert.equal(
    rules.resolveAutoResizeKey({
      activeTab: "",
      itemCounts: null,
      transportCount: -5
    }),
    "|0|0|0|0|0"
  );

  const baseLayout = rules.resolveTextareaAutoGrowState({
    style: {
      fontSize: "14px",
      lineHeight: "",
      paddingTop: "2px",
      paddingBottom: "2px",
      borderTopWidth: "1px",
      borderBottomWidth: "1px"
    },
    rows: 2,
    minRows: 2,
    maxRows: 5,
    scrollHeight: 40
  });
  assert.equal(baseLayout.lineHeight, 19);
  assert.equal(baseLayout.minHeight, 44);
  assert.equal(baseLayout.maxHeight, 101);
  assert.equal(baseLayout.nextHeight, 44);
  assert.equal(baseLayout.overflowY, "hidden");

  const cappedLayout = rules.resolveTextareaAutoGrowState({
    style: {
      fontSize: "14px",
      lineHeight: "20px",
      paddingTop: "2px",
      paddingBottom: "2px",
      borderTopWidth: "1px",
      borderBottomWidth: "1px"
    },
    rows: 2,
    minRows: 2,
    maxRows: 4,
    scrollHeight: 400
  });
  assert.equal(cappedLayout.maxHeight, 86);
  assert.equal(cappedLayout.nextHeight, 86);
  assert.equal(cappedLayout.overflowY, "auto");

  assert.equal(
    rules.resolveSheetWindowTargetHeight({
      configuredMinHeight: 500,
      formNaturalHeight: 420,
      headerHeight: 40
    }),
    500
  );
  assert.equal(
    rules.resolveSheetWindowTargetHeight({
      configuredMinHeight: 300,
      formNaturalHeight: 10,
      headerHeight: 10
    }),
    420
  );
  assert.equal(
    rules.resolveSheetWindowTargetHeight({
      configuredMinHeight: Number.NaN,
      formNaturalHeight: 100,
      headerHeight: 20
    }),
    820
  );

  assert.deepEqual(
    rules.resolveSheetWindowPosition({
      requestedPosition: { width: 1600, height: 100, left: 2000, top: -20 },
      currentPosition: { width: 800, height: 600 },
      defaultOptions: { width: 1195, height: 670 },
      viewportWidth: 1280,
      viewportHeight: 720
    }),
    { width: 1256, height: 420, left: 12, top: 12 }
  );
  assert.deepEqual(
    rules.resolveSheetWindowPosition({
      requestedPosition: {},
      currentPosition: { width: 900, height: 500, left: 40, top: 50 },
      defaultOptions: { width: 1195, height: 670 },
      viewportWidth: 1440,
      viewportHeight: 900
    }),
    { width: 900, height: 500, left: 40, top: 50 }
  );

  assert.equal(rules.resolveResponsiveLayoutMode({ width: 900, height: 900, activeTab: "carac" }), "narrow");
  assert.equal(rules.resolveResponsiveLayoutMode({ width: 1200, height: 900, activeTab: "carac" }), "compact");
  assert.equal(rules.resolveResponsiveLayoutMode({ width: 1300, height: 640, activeTab: "carac" }), "compact");
  assert.equal(rules.resolveResponsiveLayoutMode({ width: 1300, height: 900, activeTab: " equipement " }), "compact");
  assert.equal(rules.resolveResponsiveLayoutMode({ width: 1500, height: 900, activeTab: "pouvoirs" }), "wide");
}

run()
  .then(() => {
    console.log("actor-sheet-layout.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
