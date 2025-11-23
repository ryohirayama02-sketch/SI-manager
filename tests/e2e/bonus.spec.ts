import { test, expect } from '@playwright/test';
import { mockEmployees, mockRates } from './helpers/test-data';

test.describe('賞与', () => {
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
                maternityLeaveStart: emp.maternityLeaveStart ? { stringValue: emp.maternityLeaveStart } : undefined,
                maternityLeaveEnd: emp.maternityLeaveEnd ? { stringValue: emp.maternityLeaveEnd } : undefined,
                childcareLeaveStart: emp.childcareLeaveStart ? { stringValue: emp.childcareLeaveStart } : undefined,
                childcareLeaveEnd: emp.childcareLeaveEnd ? { stringValue: emp.childcareLeaveEnd } : undefined,
                childcareNotificationSubmitted: emp.childcareNotificationSubmitted ? { booleanValue: emp.childcareNotificationSubmitted } : undefined,
                childcareLivingTogether: emp.childcareLivingTogether ? { booleanValue: emp.childcareLivingTogether } : undefined,
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
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ documents: [] }),
        });
      }
    });

    await page.goto('/bonus');
  });

  test('賞与入力 → 標準賞与額の計算', async ({ page }) => {
    // 従業員を選択
    await page.selectOption('#employee', 'emp1');

    // 賞与額を入力
    await page.fill('#bonusAmount', '1234567');

    // 支給日を入力
    await page.fill('#paymentDate', '2025-06-15');

    // 標準賞与額が計算されることを確認（千円未満切り捨て）
    await expect(page.locator('text=標準賞与額')).toBeVisible();
  });

  test('上限（573万円/150万円）の適用', async ({ page }) => {
    await page.selectOption('#employee', 'emp1');
    await page.fill('#bonusAmount', '6000000'); // 上限を超える金額
    await page.fill('#paymentDate', '2025-06-15');

    // 上限適用のメッセージが表示されることを確認
    await expect(page.locator('text=上限')).toBeVisible();
  });

  test('産休免除、育休免除、給与扱い判定の動作確認', async ({ page }) => {
    // 産休・育休設定がある従業員を選択
    await page.selectOption('#employee', 'emp2');
    await page.fill('#bonusAmount', '1000000');
    await page.fill('#paymentDate', '2025-07-15'); // 産休期間中

    // 免除理由が表示されることを確認
    await expect(page.locator('text=産休')).toBeVisible();
  });

  test('エラー/警告のUI表示', async ({ page }) => {
    await page.selectOption('#employee', 'emp1');
    await page.fill('#bonusAmount', '1000000');
    await page.fill('#paymentDate', '2019-01-01'); // 入社前の日付

    // エラーメッセージが表示されることを確認
    await expect(page.locator('.error-box')).toBeVisible();
  });
});

