import { describe, expect, it } from "vitest";
import { findDuplicateLinkedAccount } from "./plaid-duplicates";

describe("findDuplicateLinkedAccount", () => {
  const existing = [
    { mask: "1234", connectionId: "conn-1", institutionName: "Fidelity" },
    { mask: "9876", connectionId: null, institutionName: "Fidelity" },
    { mask: "4321", connectionId: "conn-2", institutionName: "Tellus" },
  ];

  it("matches the same institution and a linked incoming account mask", () => {
    expect(findDuplicateLinkedAccount("Fidelity", ["0000", "1234"], existing))
      .toEqual(existing[0]);
  });

  it("ignores unlinked accounts, other institutions, and missing masks", () => {
    expect(findDuplicateLinkedAccount("Fidelity", ["9876"], existing)).toBeNull();
    expect(findDuplicateLinkedAccount("Fidelity", ["4321"], existing)).toBeNull();
    expect(findDuplicateLinkedAccount("Fidelity", [null], existing)).toBeNull();
  });
});
