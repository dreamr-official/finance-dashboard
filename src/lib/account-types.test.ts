import { describe, expect, it } from "vitest";
import { deriveAccountTypeUpdate } from "./account-types";

describe("deriveAccountTypeUpdate", () => {
  it("sets the asset class and liability sign when an asset becomes a liability", () => {
    expect(
      deriveAccountTypeUpdate(
        { type: "checking", assetClass: "cash", currentBalance: 1000 },
        { type: "credit_card" },
      ),
    ).toEqual({
      type: "credit_card",
      asset_class: "liability",
      current_balance: -1000,
    });
  });

  it("sets the asset class and positive sign when a liability becomes an asset", () => {
    expect(
      deriveAccountTypeUpdate(
        { type: "loan", assetClass: "liability", currentBalance: -300 },
        { type: "brokerage" },
      ),
    ).toEqual({
      type: "brokerage",
      asset_class: "investment",
      current_balance: 300,
    });
  });

  it("normalizes manually edited liability balances and preserves Plaid types", () => {
    expect(
      deriveAccountTypeUpdate(
        { type: "credit_card", assetClass: "liability", currentBalance: -100 },
        { current_balance: 25 },
      ),
    ).toEqual({ current_balance: -25 });
    expect(
      deriveAccountTypeUpdate(
        { type: "roth_ira", assetClass: "retirement", currentBalance: 25 },
        { type: "brokerage" },
      ),
    ).toEqual({
      type: "brokerage",
      asset_class: "investment",
    });
  });
});
