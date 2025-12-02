# アプリ全体 肥大化調査レポート

## 📊 調査結果サマリー

アラート画面関係の分割完了後、アプリ全体で以下のファイルが開発ガイドライン（コンポーネント 200 行以下、サービス 300 行以下）を超過しています。

---

## 🔴 重大な肥大化（優先度：高）

### 1. `salary-calculation.service.ts` - **1953 行** ⚠️⚠️⚠️

**場所**: `src/app/services/salary-calculation.service.ts`

**責務**:

- 定時決定（算定基礎届）の計算
- 随時改定の計算
- 資格取得時決定の計算
- 給与データの集計・平均計算
- 等級判定
- 標準報酬月額の計算
- 産休・育休の考慮
- 加入区分の考慮

**問題点**:

- 300 行制限の**6.5 倍**を超過
- 複数の計算ロジックが 1 つのサービスに集約されている
- 単一責任の原則に違反している可能性が高い

**推奨分割方針**:

1. **定時決定計算サービス** (`teiji-calculation.service.ts`)
2. **随時改定計算サービス** (`suiji-calculation.service.ts`)
3. **資格取得時決定計算サービス** (`shikaku-calculation.service.ts`)
4. **等級判定サービス** (`grade-determination.service.ts`) - 共通ロジックとして分離
5. **給与集計サービス** (`salary-aggregation.service.ts`) - 共通ロジックとして分離

**分割後の想定行数**: 各サービス 300 行以下

---

### 2. `payment-summary-calculation.service.ts` - **840 行** ⚠️⚠️

**場所**: `src/app/services/payment-summary-calculation.service.ts`

**責務**:

- 月次保険料の計算
- 会社全体の月次合計計算
- 年間保険料合計計算
- 賞与保険料の計算
- 届出要否判定の集約

**問題点**:

- 300 行制限の**2.8 倍**を超過
- 保険料計算と集計ロジックが混在

**推奨分割方針**:

1. **月次保険料計算サービス** (`monthly-premium-calculation.service.ts`)
2. **賞与保険料計算サービス** (`bonus-premium-calculation.service.ts`)
3. **保険料集計サービス** (`premium-aggregation.service.ts`)

**分割後の想定行数**: 各サービス 300 行以下

---

### 3. `payment-summary-page.component.ts` - **668 行** ⚠️⚠️

**場所**: `src/app/features/insurance-payment-summary/payment-summary-page.component.ts`

**責務**:

- ページ全体の状態管理（従業員、年度、月、保険料データなど）
- データロード・集計処理
- UI 制御（タブ切り替え、フィルタリングなど）
- エラー・警告メッセージ管理

**問題点**:

- 200 行制限の**3.3 倍**を超過
- 状態管理とビジネスロジックが混在

**推奨分割方針**:

1. **状態管理サービス** (`payment-summary-state.service.ts`) - 状態管理を分離
2. **データロードサービス** (`payment-summary-data.service.ts`) - データロード処理を分離
3. コンポーネントは**200 行以下**に削減（UI 制御のみ）

**分割後の想定行数**: コンポーネント 200 行以下、各サービス 300 行以下

---

## 🟡 中程度の肥大化（優先度：中）

### 4. `monthly-salaries-page.component.ts` - **403 行** ⚠️

**場所**: `src/app/features/monthly-salaries/monthly-salaries-page.component.ts`

**責務**:

- ページ全体の状態管理
- 給与データのロード・編集
- 計算結果の表示制御
- CSV インポート処理

**問題点**:

- 200 行制限の**2 倍**を超過
- 既に`MonthlySalaryUIService`に一部ロジックが移譲されているが、まだ状態管理が残っている

**推奨分割方針**:

1. **状態管理サービス** (`monthly-salaries-state.service.ts`) - 状態管理を完全分離
2. コンポーネントは**200 行以下**に削減

**分割後の想定行数**: コンポーネント 200 行以下

---

### 5. `employee-basic-info-form.component.ts` - **343 行** ⚠️

**場所**: `src/app/features/employees/employee-edit-page/employee-basic-info-form/employee-basic-info-form.component.ts`

**責務**:

- フォーム管理（Reactive Forms）
- バリデーション
- 子コンポーネントとの連携
- データの保存処理

**問題点**:

- 200 行制限の**1.7 倍**を超過
- フォーム管理とビジネスロジックが混在

**推奨分割方針**:

1. **フォーム管理サービス** (`employee-basic-info-form.service.ts`) - フォーム構築・バリデーションを分離
2. コンポーネントは**200 行以下**に削減（UI 制御のみ）

**分割後の想定行数**: コンポーネント 200 行以下

---

### 6. `notification-calculation.service.ts` - **386 行** ⚠️

**場所**: `src/app/services/notification-calculation.service.ts`

**責務**:

- 届出要否の判定ロジック
- 定時決定・随時改定・賞与の届出判定

**問題点**:

- 300 行制限の**1.3 倍**を超過
- 複数の届出タイプの判定ロジックが混在

**推奨分割方針**:

1. **定時決定届出判定サービス** (`teiji-notification.service.ts`)
2. **随時改定届出判定サービス** (`suiji-notification.service.ts`)
3. **賞与届出判定サービス** (`bonus-notification.service.ts`)
4. 共通ロジックは**通知判定基底サービス**に集約

**分割後の想定行数**: 各サービス 300 行以下

---

## 🟢 軽微な肥大化（優先度：低）

### 7. `bonus-edit-page.component.ts` - **249 行**

**場所**: `src/app/features/bonus/bonus-edit-page/bonus-edit-page.component.ts`

**問題点**:

- 200 行制限の**1.2 倍**を超過
- フォーム管理とデータロード処理が含まれている

**推奨分割方針**:

- フォーム管理ロジックをサービスに分離
- コンポーネントを**200 行以下**に削減

---

## 📋 推奨対応順序

### Phase 1: 重大な肥大化の解消（優先度：高）

1. **`salary-calculation.service.ts`の分割** (1953 行 → 各 300 行以下)

   - 影響範囲が広いため、慎重に段階的に分割
   - テストを充実させてから実施

2. **`payment-summary-page.component.ts`の分割** (668 行 → 200 行以下)

   - 状態管理サービスへの分離
   - データロードサービスへの分離

3. **`payment-summary-calculation.service.ts`の分割** (840 行 → 各 300 行以下)
   - 月次・賞与・集計の分離

### Phase 2: 中程度の肥大化の解消（優先度：中）

4. **`monthly-salaries-page.component.ts`の分割** (403 行 → 200 行以下)
5. **`employee-basic-info-form.component.ts`の分割** (343 行 → 200 行以下)
6. **`notification-calculation.service.ts`の分割** (386 行 → 各 300 行以下)

### Phase 3: 軽微な肥大化の解消（優先度：低）

7. **`bonus-edit-page.component.ts`の分割** (249 行 → 200 行以下)

---

## 📝 注意事項

- **段階的な分割**: 一度に大きな変更を加えない
- **テストの充実**: 分割前後で動作が変わらないことを確認
- **既存の動作を壊さない**: UI や機能は変更しない
- **単一責任の原則**: 各サービス・コンポーネントは 1 つの責務のみを持つ
- **依存関係の整理**: サービス間の依存関係を明確にする

---

## ✅ 完了済み（参考）

- ✅ `alerts-dashboard-page.component.ts` - リファクタリング完了（987 行 → 約 300 行以下）
- ✅ アラートタブコンポーネント群 - 分割・リファクタリング完了

---

**調査日**: 2025 年 1 月
**調査対象**: `src/app`配下の全`.component.ts`および`.service.ts`ファイル
