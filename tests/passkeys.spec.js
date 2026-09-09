import { test, expect } from "./app-fixture.js";

for (const status of [0, 400, 503]) {
  test(`registration failure ${status} preserves the created passkey`, async ({ page, appData }) => {
    appData.setSession({ authenticated: false, bootstrapRequired: true, user: null });
    await page.addInitScript(() => {
      globalThis.unknownCredentials = [];
      Object.defineProperty(navigator.credentials, "create", {
        value: async () => ({ toJSON: () => ({ id: "new-passkey" }) }),
      });
      PublicKeyCredential.parseCreationOptionsFromJSON = (value) => value;
      PublicKeyCredential.signalUnknownCredential = async (value) => globalThis.unknownCredentials.push(value);
    });
    await page.route("**/api/auth/registration/options", (route) =>
      route.fulfill({ json: { rp: { id: "example.test" } } }),
    );
    await page.route("**/api/auth/registration/verify", (route) =>
      status ? route.fulfill({ status, json: { error: "Rejected", code: "registration_failed" } }) : route.abort(),
    );
    await page.goto("/work");
    await page.getByLabel("One-time setup code").fill("setup-code");
    await page.getByRole("button", { name: "Create passkey", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(status === 400 ? "Rejected" : "Try signing in");
    expect(await page.evaluate(() => globalThis.unknownCredentials)).toEqual([]);
  });
}

test("unknown sign-in credentials use the ceremony RP ID", async ({ page, appData }) => {
  appData.setSession({ authenticated: false, bootstrapRequired: false, user: null });
  await page.addInitScript(() => {
    globalThis.unknownCredentials = [];
    Object.defineProperty(navigator.credentials, "get", { value: async () => ({ toJSON: () => ({ id: "missing" }) }) });
    PublicKeyCredential.parseRequestOptionsFromJSON = (value) => value;
    PublicKeyCredential.signalUnknownCredential = async (value) => globalThis.unknownCredentials.push(value);
  });
  await page.route("**/api/auth/authentication/options", (route) => route.fulfill({ json: { rpId: "example.test" } }));
  await page.route("**/api/auth/authentication/verify", (route) =>
    route.fulfill({ status: 404, json: { error: "Missing", code: "credential_not_found" } }),
  );
  await page.goto("/work");
  await page.getByRole("button", { name: "Sign in with passkey", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => globalThis.unknownCredentials))
    .toEqual([{ rpId: "example.test", credentialId: "missing" }]);
});
