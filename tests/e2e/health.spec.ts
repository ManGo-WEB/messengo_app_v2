// Дымовой тест E2E-стенда (план C4): стенд поднят и API отвечает.
import { test, expect } from "@playwright/test";

test("стенд жив: /api/health отвечает ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as { status: string };
  expect(data.status).toBe("ok");
});
