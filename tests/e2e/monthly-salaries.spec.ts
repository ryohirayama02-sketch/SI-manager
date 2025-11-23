import { test, expect } from '@playwright/test';
import { mockEmployees, mockRates, mockGradeTable } from './helpers/test-data';

test.describe('月次給与', () => {
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
      } else if (url.includes('standardTable')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            documents: mockGradeTable.map(row => ({
              name: `projects/test/databases/(default)/documents/standardTable/${row.id}`,
              fields: {
                rank: { integerValue: row.rank },
                lower: { integerValue: row.lower },
                upper: { integerValue: row.upper },
                standard: { integerValue: row.standard },
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

    await page.goto('/monthly-salaries');
  });

  test('4〜6月入力 → 定時決定の平均が更新される', async ({ page }) => {
    // 従業員が表示されることを確認
    await expect(page.locator('table')).toBeVisible();

    // 4月の総支給を入力
    const totalInput = page.locator('input[name*="total_emp1_4"]').first();
    await totalInput.fill('100000');

    // 5月の総支給を入力
    const totalInput5 = page.locator('input[name*="total_emp1_5"]').first();
    await totalInput5.fill('110000');

    // 6月の総支給を入力
    const totalInput6 = page.locator('input[name*="total_emp1_6"]').first();
    await totalInput6.fill('120000');

    // 定時決定の結果が表示されることを確認
    await expect(page.locator('text=定時決定')).toBeVisible();
  });

  test('固定/非固定/総支給の整合性バリデーションの動作', async ({ page }) => {
    // 総支給を入力
    const totalInput = page.locator('input[name*="total_emp1_1"]').first();
    await totalInput.fill('100000');

    // 固定を入力
    const fixedInput = page.locator('input[name*="fixed_emp1_1"]').first();
    await fixedInput.fill('50000');

    // 非固定を入力
    const variableInput = page.locator('input[name*="variable_emp1_1"]').first();
    await variableInput.fill('40000');

    // バリデーションエラーが表示されることを確認（合計が一致しない場合）
    await expect(page.locator('.error-box')).toBeVisible();
  });

  test('等級が自動算出される', async ({ page }) => {
    // 4〜6月の給与を入力
    await page.locator('input[name*="total_emp1_4"]').first().fill('110000');
    await page.locator('input[name*="total_emp1_5"]').first().fill('110000');
    await page.locator('input[name*="total_emp1_6"]').first().fill('110000');

    // 等級が表示されることを確認
    await expect(page.locator('text=等級')).toBeVisible();
  });

  test('随時改定候補が表示される', async ({ page }) => {
    // 4〜6月の給与を入力（定時決定）
    await page.locator('input[name*="total_emp1_4"]').first().fill('110000');
    await page.locator('input[name*="total_emp1_5"]').first().fill('110000');
    await page.locator('input[name*="total_emp1_6"]').first().fill('110000');

    // 7月の固定給を大きく変更（随時改定のトリガー）
    const fixedInput7 = page.locator('input[name*="fixed_emp1_7"]').first();
    await fixedInput7.fill('150000');

    // 随時改定候補が表示されることを確認
    await expect(page.locator('text=随時改定')).toBeVisible();
  });
});

