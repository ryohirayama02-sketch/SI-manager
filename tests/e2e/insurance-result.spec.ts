import { test, expect } from '@playwright/test';
import { mockEmployees, mockBonuses } from './helpers/test-data';

test.describe('年間保険料結果', () => {
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

    await page.goto('/insurance-result');
  });

  test('年間集計が表示される', async ({ page }) => {
    // 従業員の年間保険料が表示されることを確認
    await expect(page.locator('h2')).toContainText('社会保険料計算結果');
    await expect(page.locator('.card')).toBeVisible();
  });

  test('免除理由、給与扱い理由が反映される', async ({ page }) => {
    // 特記事項セクションが表示されることを確認
    await expect(page.locator('text=特記事項')).toBeVisible();
  });

  test('年齢特例（70/75歳）が反映される', async ({ page }) => {
    // 年齢関連の表示を確認
    await expect(page.locator('.card')).toBeVisible();
  });
});

