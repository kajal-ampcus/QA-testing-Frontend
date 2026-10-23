import { test, expect } from "@playwright/test";
test("Automation sections collapse independently and preserve case selection", async ({page}, testInfo) => {
  page.on("pageerror", error => console.log("BROWSER ERROR", error.message));
  await page.route("**/api/v1/**", route => route.fulfill({json: route.request().url().includes("credentials") ? [] : {generations:[]}}));
  await page.goto("/tests/automation-sections-harness.html");
  const about = page.getByRole("button", {name:/About 30 cases/});
  const contact = page.getByRole("button", {name:/Contact 30 cases/});
  await expect(about).toHaveAttribute("aria-expanded","false");
  await expect(page.getByText("Check item 0", {exact:false})).toHaveCount(0);
  await page.getByRole("checkbox",{name:"Select all cases in About"}).check();
  await expect(page.getByRole("button", {name:"Generate 30 cases"})).toBeEnabled();
  await about.click();
  await expect(page.getByText(/TC-0 .* Check item 0$/)).toBeVisible();
  await expect(contact).toHaveAttribute("aria-expanded","false");
  await about.click();
  await expect(page.getByRole("button", {name:"Generate 30 cases"})).toBeEnabled();
  await page.getByRole("button",{name:"Expand all",exact:true}).click();
  await expect(about).toHaveAttribute("aria-expanded","true");
  await expect(contact).toHaveAttribute("aria-expanded","true");
  await page.getByRole("button",{name:"Collapse all",exact:true}).click();
  await expect(about).toHaveAttribute("aria-expanded","false");
  await expect(contact).toHaveAttribute("aria-expanded","false");
  await page.screenshot({path:testInfo.outputPath("automation-sections.png"),fullPage:true});
});

