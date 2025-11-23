import { test, expect } from '@playwright/test';
import { mockRates, mockGradeTable } from './helpers/test-data';

test.describe('保険料設定', () => {
  test.beforeEach(async ({ page }) => {
    // Firestore APIをモック
    await page.route('**/firestore.googleapis.com/**', route => {
      const url = route.request().url();
      if (url.includes('rates')) {
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

    await page.goto('/settings');
  });

  test('都道府県料率の保存', async ({ page }) => {
    // 料率入力フィールドが表示されることを確認
    await expect(page.locator('input[formControlName="health_employee"]')).toBeVisible();

    // 料率を変更
    await page.fill('input[formControlName="health_employee"]', '0.06');

    // 保存ボタンをクリック
    await page.click('button:has-text("保存する")');

    // 保存成功のメッセージが表示されることを確認
    await expect(page.locator('text=保存しました')).toBeVisible();
  });

  test('標準報酬月額テーブルの編集と昇順バリデーションの動作', async ({ page }) => {
    // 標準報酬月額テーブルが表示されることを確認
    await expect(page.locator('text=標準報酬月額テーブル')).toBeVisible();

    // 等級の下限を編集
    const lowerInput = page.locator('input[formControlName="lower"]').first();
    await lowerInput.fill('70000'); // 前の等級の上限より大きい値

    // バリデーションエラーが表示されることを確認
    await expect(page.locator('.error-box')).toBeVisible();
  });
});

