import { describe, expect, it } from "vitest";
import { apiErrorResponse } from "./api-error";

describe("apiErrorResponse", () => {
  it.each(["22007", "22008", "23503", "23514"])(
    "maps PostgreSQL input error %s to 400",
    (code) => {
      const response = apiErrorResponse({ code, message: "database detail" });
      expect(response.status).toBe(400);
    },
  );

  it("keeps unexpected database errors as 500", () => {
    const response = apiErrorResponse({ code: "XX000", message: "failure" });
    expect(response.status).toBe(500);
  });
});
