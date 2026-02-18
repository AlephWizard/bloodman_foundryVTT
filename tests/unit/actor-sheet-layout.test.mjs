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
}

run()
  .then(() => {
    console.log("actor-sheet-layout.test.mjs: OK");
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
