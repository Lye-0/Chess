import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../../src/lib/shiftExports.ts", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const match = source.match(
  /function escapeCsvValue\(value: string \| number\) \{\r?\n[\s\S]*?\r?\n\}/,
);

assert.ok(match, "escapeCsvValue must remain present");
assert.equal(
  (source.match(/row\.map\(escapeCsvValue\)/g) ?? []).length,
  2,
  "monthly and daily CSV paths must use the shared encoder",
);

const functionSource = match[0].replace(
  "function escapeCsvValue(value: string | number)",
  "function escapeCsvValue(value)",
);
const escapeCsvValue = vm.runInNewContext("(" + functionSource + ")");

const cases = [
  { input: "=1+1", expected: "'=1+1" },
  { input: "+CMD|' /C calc'!A0", expected: "'+CMD|' /C calc'!A0" },
  { input: "-1+1", expected: "'-1+1" },
  { input: "@SUM(1,2)", expected: "\"'@SUM(1,2)\"" },
  { input: "  =1+1", expected: "'  =1+1" },
  { input: "\t=1+1", expected: "'\t=1+1" },
  { input: "ordinary text", expected: "ordinary text" },
  { input: "safe,comma", expected: '"safe,comma"' },
  { input: "line\nbreak", expected: '"line\nbreak"' },
  { input: -1200, expected: "-1200" },
];

for (const testCase of cases) {
  assert.equal(
    escapeCsvValue(testCase.input),
    testCase.expected,
    "unexpected CSV encoding for " + JSON.stringify(testCase.input),
  );
}

console.log("[security:csv] formula-prefix neutralization: PASS");
