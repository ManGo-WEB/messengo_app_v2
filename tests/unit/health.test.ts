import { expect, test } from "bun:test";

test("заглушка каркаса: bun test запускается", () => {
  expect(1 + 1).toBe(2);
});
