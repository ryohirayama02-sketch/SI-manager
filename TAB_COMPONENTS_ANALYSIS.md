# アラートタブコンポーネント 肥大化調査レポート

## 調査日

2024 年

## 調査対象

`src/app/features/alerts-dashboard/tabs/*/` 配下の全コンポーネント

---

## 1. alert-schedule-tab.component.ts

**ファイルパス**: `src/app/features/alerts-dashboard/tabs/alert-schedule-tab/alert-schedule-tab.component.ts`

**行数**: 188 行

**メソッド数**: 10 個

- `getJSTDate()` (private)
- `formatDateKey()`
- `getTabColor()`
- `getScheduleItemsForDate()`
- `changeScheduleMonth()`
- `onScheduleDateClick()`
- `isCurrentMonth()`
- `isToday()`
- `getCalendarDays()`
- `getCalendarWeeks()`

**責務**:

- UI 表示（カレンダー表示）
- カレンダー生成ロジック（日付配列生成、週分割）
- 日付計算（前月・次月の日付計算）
- スケジュールデータの整形・表示
- タブ色の管理

**問題点**:

- カレンダー生成ロジックが複雑（前月・次月の日付計算、週分割）
- `getJSTDate()`が重複実装（utils に既に存在）
- カレンダー生成ロジックはサービス化可能
- タブ色管理が重複（state service にも存在）

**分割が必要か**: **Yes**

**推奨分割案**:

1. **カレンダー生成ロジックをサービス化**

   - `CalendarService` を作成
   - `getCalendarDays()`, `getCalendarWeeks()`, `isCurrentMonth()`, `isToday()` を移動
   - 日付計算ロジックを集約

2. **タブ色管理の統一**

   - `getTabColor()` を削除し、state service のメソッドを使用

3. **日付処理の統一**
   - `getJSTDate()` を削除し、`alerts-helper.ts` の `getJSTDate()` を使用

---

## 2. alert-suiji-tab.component.ts

**ファイルパス**: `src/app/features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component.ts`

**行数**: 127 行

**メソッド数**: 10 個

- `getJSTDate()` (private)
- `formatDate()`
- `getEmployeeName()`
- `getStatusText()`
- `getSuijiReportDeadline()` (ビジネスロジック)
- `getReasonText()`
- `isLargeChange()`
- `getSuijiAlertId()`
- `toggleSuijiAlertSelection()`
- `toggleAllSuijiAlertsChange()`
- `isSuijiAlertSelected()`
- `deleteSelectedSuijiAlerts()`

**責務**:

- UI 表示
- 選択管理
- 日付フォーマット
- ビジネスロジック（提出期日計算）
- 従業員名取得

**問題点**:

- `getJSTDate()`が重複実装（utils に既に存在）
- `formatDate()`が重複実装（utils に既に存在）
- ビジネスロジック（提出期日計算）がコンポーネントに混在
- `getSuijiAlertId()`が重複（親コンポーネントにも存在）

**分割が必要か**: **Yes**

**推奨分割案**:

1. **日付処理の統一**

   - `getJSTDate()`, `formatDate()` を削除し、`alerts-helper.ts` の関数を使用

2. **ビジネスロジックをサービス化**

   - `SuijiAlertService` を作成
   - `getSuijiReportDeadline()`, `isLargeChange()`, `getSuijiAlertId()` を移動

3. **従業員名取得の最適化**
   - `getEmployeeName()` は親から受け取るか、サービス化を検討

---

## 3. alert-age-tab.component.ts

**ファイルパス**: `src/app/features/alerts-dashboard/tabs/alert-age-tab/alert-age-tab.component.ts`

**行数**: 108 行

**メソッド数**: 10 個

- `formatDate()`
- `formatBirthDate()`
- `toggleAgeAlertSelection()`
- `toggleAllAgeAlertsChange()`
- `isAgeAlertSelected()`
- `deleteSelectedAgeAlerts()`
- `toggleQualificationChangeAlertSelection()`
- `toggleAllQualificationChangeAlertsChange()`
- `isQualificationChangeAlertSelected()`
- `deleteSelectedQualificationChangeAlerts()`

**責務**:

- UI 表示（2 種類のアラートタイプ）
- 選択管理（年齢到達・資格変更の 2 種類）
- 日付フォーマット

**問題点**:

- `formatDate()`が重複実装（utils に既に存在）
- 2 種類のアラートタイプを 1 つのコンポーネントで管理（責務が 2 つ）
- 選択管理ロジックが重複（年齢到達と資格変更で同じパターン）

**分割が必要か**: **Yes**

**推奨分割案**:

1. **日付処理の統一**

   - `formatDate()`, `formatBirthDate()` を削除し、`alerts-helper.ts` の関数を使用

2. **コンポーネント分割**

   - `alert-age-alert-list.component.ts` (年齢到達アラート専用)
   - `alert-qualification-change-alert-list.component.ts` (資格変更アラート専用)
   - 親コンポーネントは 2 つの子コンポーネントを配置するだけ

3. **選択管理ロジックの共通化**
   - 共通の選択管理サービスを作成するか、共通コンポーネントを作成

---

## 4. alert-bonus-tab.component.ts

**ファイルパス**: `src/app/features/alerts-dashboard/tabs/alert-bonus-tab/alert-bonus-tab.component.ts`

**行数**: 74 行

**メソッド数**: 6 個

- `formatDate()`
- `formatPayDate()`
- `toggleBonusReportAlertSelection()`
- `toggleAllBonusReportAlertsChange()`
- `isBonusReportAlertSelected()`
- `deleteSelectedBonusReportAlerts()`

**責務**:

- UI 表示
- 選択管理
- 日付フォーマット

**問題点**:

- `formatDate()`が重複実装（utils に既に存在）
- 問題なし（適切なサイズ）

**分割が必要か**: **No**（ただし日付処理の統一は推奨）

**推奨改善案**:

- `formatDate()` を削除し、`alerts-helper.ts` の `formatDate()` を使用

---

## 5. alert-family-tab.component.ts

**ファイルパス**: `src/app/features/alerts-dashboard/tabs/alert-family-tab/alert-family-tab.component.ts`

**行数**: 68 行

**メソッド数**: 5 個

- `formatDate()`
- `toggleSupportAlertSelection()`
- `toggleAllSupportAlertsChange()`
- `isSupportAlertSelected()`
- `deleteSelectedSupportAlerts()`

**責務**:

- UI 表示
- 選択管理
- 日付フォーマット

**問題点**:

- `formatDate()`が重複実装（utils に既に存在）
- 問題なし（適切なサイズ）

**分割が必要か**: **No**（ただし日付処理の統一は推奨）

**推奨改善案**:

- `formatDate()` を削除し、`alerts-helper.ts` の `formatDate()` を使用

---

## 6. alert-leave-tab.component.ts

**ファイルパス**: `src/app/features/alerts-dashboard/tabs/alert-leave-tab/alert-leave-tab.component.ts`

**行数**: 63 行

**メソッド数**: 5 個

- `formatDate()`
- `toggleMaternityChildcareAlertSelection()`
- `toggleAllMaternityChildcareAlertsChange()`
- `isMaternityChildcareAlertSelected()`
- `deleteSelectedMaternityChildcareAlerts()`

**責務**:

- UI 表示
- 選択管理
- 日付フォーマット

**問題点**:

- `formatDate()`が重複実装（utils に既に存在）
- 問題なし（適切なサイズ）

**分割が必要か**: **No**（ただし日付処理の統一は推奨）

**推奨改善案**:

- `formatDate()` を削除し、`alerts-helper.ts` の `formatDate()` を使用

---

## 7. alert-teiji-tab.component.ts

**ファイルパス**: `src/app/features/alerts-dashboard/tabs/alert-teiji-tab/alert-teiji-tab.component.ts`

**行数**: 63 行

**メソッド数**: 3 個

- `formatDate()`
- `getTeijiReportDeadline()`
- `onTeijiYearChange()`

**責務**:

- UI 表示
- 日付フォーマット
- 提出期日計算（ビジネスロジック）

**問題点**:

- `formatDate()`が重複実装（utils に既に存在）
- ビジネスロジック（提出期日計算）がコンポーネントに混在

**分割が必要か**: **No**（ただし日付処理の統一とビジネスロジックの分離は推奨）

**推奨改善案**:

1. `formatDate()` を削除し、`alerts-helper.ts` の `formatDate()` を使用
2. `getTeijiReportDeadline()` をサービスに移動（`TeijiKetteiService` など）

---

## まとめ

### 肥大化している順（行数順）

1. **alert-schedule-tab.component.ts** (188 行) - **分割必要**
2. **alert-suiji-tab.component.ts** (127 行) - **分割必要**
3. **alert-age-tab.component.ts** (108 行) - **分割必要**
4. **alert-bonus-tab.component.ts** (74 行) - 問題なし
5. **alert-family-tab.component.ts** (68 行) - 問題なし
6. **alert-leave-tab.component.ts** (63 行) - 問題なし
7. **alert-teiji-tab.component.ts** (63 行) - 問題なし

### 共通の問題点

1. **日付処理の重複実装**

   - すべてのコンポーネントで `formatDate()` が重複
   - `getJSTDate()` も重複（schedule, suiji）
   - → `alerts-helper.ts` の関数を使用すべき

2. **ビジネスロジックの混在**

   - `getSuijiReportDeadline()` (suiji)
   - `getTeijiReportDeadline()` (teiji)
   - → サービスに移動すべき

3. **タブ色管理の重複**
   - `getTabColor()` が schedule と state service に存在
   - → state service に統一すべき

### 優先度の高い分割対象

1. **alert-schedule-tab.component.ts** (最優先)

   - カレンダー生成ロジックが複雑
   - サービス化により再利用性向上

2. **alert-age-tab.component.ts**

   - 2 種類のアラートタイプを 1 コンポーネントで管理
   - コンポーネント分割により責務明確化

3. **alert-suiji-tab.component.ts**
   - ビジネスロジックが混在
   - サービス化によりテスト容易化
