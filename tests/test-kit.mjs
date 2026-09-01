import assert from "node:assert/strict";

export const cases = [];

export function test(id, fn) {
  cases.push({ id, fn });
}

export { assert };
