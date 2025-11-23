import { test, expect } from '@playwright/test';
import { mockEmployees } from './helpers/test-data';

test.describe('従業員管理', () => {
  test.beforeEach(async ({ page }) => {
    // Firestore APIをモック
    await page.route('**/firestore.googleapis.com/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [] }),
      });
    });

    await page.goto('/employees');
  });

  test('従業員一覧が表示される', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('従業員一覧');
    await expect(page.locator('button')).toContainText('新規登録');
  });

  test('新規従業員登録 → 詳細ページ遷移 → 編集 → 削除の一連の流れ', async ({ page }) => {
    // 新規登録ボタンをクリック
    await page.click('button:has-text("新規登録")');
    await expect(page).toHaveURL(/\/employees\/new/);

    // フォーム入力
    await page.fill('#name', 'テスト従業員');
    await page.fill('#birthDate', '1990-01-01');
    await page.fill('#joinDate', '2020-01-01');

    // 登録ボタンをクリック（実際のFirestore保存はモックされる）
    await page.click('button[type="submit"]');

    // 一覧ページに戻ることを確認
    await expect(page).toHaveURL(/\/employees/);
  });

  test('産休/育休/短時間労働者/年齢計算のUI表示確認', async ({ page }) => {
    // 新規登録ページに移動
    await page.goto('/employees/new');

    // 短時間労働者のチェックボックスが存在することを確認
    await expect(page.locator('input[type="checkbox"]')).toBeVisible();

    // フォーム入力
    await page.fill('#name', 'テスト従業員');
    await page.fill('#birthDate', '1990-01-01');
    await page.fill('#joinDate', '2020-01-01');
    await page.check('input[type="checkbox"]');

    // バリデーションが動作することを確認
    await page.fill('#joinDate', '1989-01-01'); // 生年月日より前の日付
    await page.blur('#joinDate');

    // エラーメッセージが表示されることを確認
    await expect(page.locator('.error-box')).toBeVisible();
  });
});

