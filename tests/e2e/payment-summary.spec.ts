import { test, expect } from '@playwright/test';
import { mockEmployees, mockRates, mockBonuses } from './helpers/test-data';

test.describe('振込額一覧', () => {
  test.beforeEach(async ({ page }) => {
    // Firestore APIをモック
    await page.route('**/firestore.googleapis.com/**', route => {
      const url = route.request().url();
      if (url.includes('employees')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: mockEmployees.map(emp => ({
              name: `projects/test/databases/(default)/documents/employees/${emp.id}`,
              fields: {
                name: { stringValue: emp.name },
                birthDate: { stringValue: emp.birthDate },
                joinDate: { stringValue: emp.joinDate },
                isShortTime: { booleanValue: emp.isShortTime },
              },
            })),
          }),
        });
      } else if (url.includes('rates')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: [{
              name: 'projects/test/databases/(default)/documents/rates/2025_tokyo',
              fields: mockRates,
            }],
          }),
        });
      } else if (url.includes('bonuses')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: mockBonuses.map(bonus => ({
              name: `projects/test/databases/(default)/documents/bonuses/${bonus.id}`,
              fields: {
                employeeId: { stringValue: bonus.employeeId },
                payDate: { stringValue: bonus.payDate },
                amount: { integerValue: bonus.amount },
                healthEmployee: { integerValue: bonus.healthEmployee },
                healthEmployer: { integerValue: bonus.healthEmployer },
                careEmployee: { integerValue: bonus.careEmployee },
                careEmployer: { integerValue: bonus.careEmployer },
                pensionEmployee: { integerValue: bonus.pensionEmployee },
                pensionEmployer: { integerValue: bonus.pensionEmployer },
                isExempted: { booleanValue: bonus.isExempted },
                isSalaryInsteadOfBonus: { booleanValue: bonus.isSalaryInsteadOfBonus },
              },
            })),
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ documents: [] }),
        });
      }
    });

    await page.goto('/insurance-payment-summary');
  });

  test('月次会社負担が正しいフォーマットで表示される', async ({ page }) => {
    // 振込額一覧のテーブルが表示されることを確認
    await expect(page.locator('h2')).toContainText('振込額一覧');
    await expect(page.locator('table')).toBeVisible();

    // 月ごとの集計が表示されることを確認
    await expect(page.locator('text=1月')).toBeVisible();
    await expect(page.locator('text=年間合計')).toBeVisible();
  });
});

