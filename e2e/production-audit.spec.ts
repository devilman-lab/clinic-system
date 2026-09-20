/**
 * 本番デプロイに対する機能監査。
 *
 *   E2E_BASE_URL=https://<host> npx playwright test production-audit --project=desktop
 *
 * 仕様書のデモシナリオ 1〜5 と最終チェックリストを実際の画面操作で通す。
 * 本番 DB に書き込むため、作成したデータは各テスト内で必ず元に戻す。
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const SHOTS = 'test-results/audit';
const TAG = `AUDIT${Date.now().toString().slice(-6)}`;

type Account = { username: string; password: string };
const ADMIN: Account = { username: 'admin', password: 'admin123' };
const STAFF: Account = { username: 'staff', password: 'staff123' };
const DOCTOR: Account = { username: 'doctor_a', password: 'doctor123' };

async function login(page: Page, account: Account = ADMIN) {
  await page.goto('/login');
  await page.getByLabel('ユーザーID').fill(account.username);
  await page.getByLabel('パスワード').fill(account.password);
  await page.getByRole('button', { name: 'サインイン' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function selectSurgery(page: Page, name: string) {
  const select = page.getByTestId('surgery-select');
  const value = await select.locator('option').filter({ hasText: name }).first().getAttribute('value');
  await select.selectOption(value!);
}

function doctorChip(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: false }).first();
}

/** カレンダーの予約カード。title に「HH:MM〜HH:MM X手術 / 医師 / 患者」が入っている。 */
function bookingCards(page: Page): Locator {
  return page.locator('button[title*="手術 / "]');
}

async function runSearch(page: Page, surgery: string, doctors: string[] = [], room?: string) {
  await page.goto('/search');
  await selectSurgery(page, surgery);
  await page.getByRole('button', { name: '指定なし', exact: true }).click();
  for (const d of doctors) await doctorChip(page, d).click();
  if (room) {
    const roomSelect = page.locator('select').nth(1);
    await roomSelect.selectOption({ label: room });
  }
  await page.getByRole('button', { name: '空き枠を検索' }).click();
  await expect(
    page.getByTestId('best-slot').or(page.getByText('条件を満たす空き枠が見つかりませんでした'))
  ).toBeVisible();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/* ================================================================== */
test.describe('A. 認証と権限', () => {
  test('A1 未ログインは /login へ', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('A2 誤ったパスワードは理由を明かさず拒否', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('ユーザーID').fill('admin');
    await page.getByLabel('パスワード').fill('wrong-password');
    await page.getByRole('button', { name: 'サインイン' }).click();
    await expect(page.getByText('ユーザーIDまたはパスワードが正しくありません')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('A3 改ざんした Cookie は無効', async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: 'clinic_session', value: 'eyJmYWtlIjoxfQ.tampered', url: baseURL! },
    ]);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('A4 スタッフは管理画面へ入れず、サイドバーにも出ない', async ({ page }) => {
    await login(page, STAFF);
    await expect(page.getByRole('link', { name: '医師管理' })).toHaveCount(0);
    await page.goto('/admin/doctors');
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/$/);
  });

  test('A5 医師アカウントもログインでき、マスタ管理は見えない', async ({ page }) => {
    await login(page, DOCTOR);
    await expect(page.getByText('A医師').first()).toBeVisible();
    await expect(page.getByRole('link', { name: '定例枠設定' })).toHaveCount(0);
  });

  test('A6 管理者はマスタ管理が見え、ログアウトできる', async ({ page }) => {
    await login(page, ADMIN);
    await expect(page.getByRole('link', { name: '医師管理' })).toBeVisible();
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});

/* ================================================================== */
test.describe('B. ダッシュボード（Demo 1）', () => {
  test('B1 業務状況が一目で分かる', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
    await expect(page.getByText('次の手術').first()).toBeVisible();

    for (const label of ['の手術', '次の手術日', 'の空き枠', '未確定予約']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText('手術室の稼働率')).toBeVisible();
    await expect(page.getByText('手術室1').first()).toBeVisible();
    await expect(page.getByText('手術室2').first()).toBeVisible();
    await expect(page.getByText(/\d+%/).first()).toBeVisible();
    await expect(page.getByText(/の手術予定$/)).toBeVisible();

    await shot(page, 'B1-dashboard');
  });

  test('B2 「手術スケジュールを開く」はその日の日表示へ', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /手術スケジュールを開く/ }).click();
    await expect(page).toHaveURL(/\/calendar\?view=day&date=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('heading', { name: '手術スケジュール' })).toBeVisible();
  });
});

/* ================================================================== */
test.describe('C. 手術スケジュール（カレンダー）', () => {
  test('C1 週表示：手術室別に定例枠・予約・空きが重なって見える', async ({ page }) => {
    await login(page);
    await page.goto('/calendar?view=week');
    await expect(page.getByRole('button', { name: '週', exact: true })).toHaveClass(/bg-brand-600/);
    await expect(page.getByText('定例枠', { exact: true })).toBeVisible();
    await expect(page.getByText('例外・臨時枠')).toBeVisible();
    await expect(page.getByText('空き（タップで予約）')).toBeVisible();

    await expect(page.getByText(/\d{4}-\d{2}-\d{2}（[月火水木金]）/).first()).toBeVisible();
    await expect(page.getByText('手術室1').first()).toBeVisible();

    expect(await bookingCards(page).count()).toBeGreaterThan(5);

    const gaps = page.getByRole('button', { name: /^\+ \d+分$/ });
    expect(await gaps.count()).toBeGreaterThan(0);

    await shot(page, 'C1-week-room');
  });

  test('C2 医師別に切り替えると A〜E医師の行になる', async ({ page }) => {
    await login(page);
    await page.goto('/calendar?view=week');
    await page.getByRole('button', { name: '医師別' }).click();
    for (const d of ['A医師', 'B医師', 'C医師']) {
      await expect(page.getByText(d, { exact: true }).first()).toBeVisible();
    }
    await shot(page, 'C2-week-doctor');
  });

  test('C3 日表示は患者名・ステータスまで表示', async ({ page }) => {
    await login(page);
    await page.goto('/calendar?view=day');
    await expect(page.getByRole('button', { name: '日', exact: true })).toHaveClass(/bg-brand-600/);
    await expect(page.getByText(/デモ患者\d{3}/).first()).toBeVisible();
    await expect(page.getByText('確定', { exact: true }).first()).toBeVisible();
    await shot(page, 'C3-day');
  });

  test('C4 月表示：日ごとの件数・空き・例外が見える', async ({ page }) => {
    await login(page);
    await page.goto('/calendar?view=month');
    await expect(page.getByText(/^\d{4}年\d{1,2}月$/)).toBeVisible();
    await expect(page.getByText(/手術 \d+件/).first()).toBeVisible();
    await expect(page.getByText(/空き \d+分/).first()).toBeVisible();
    await shot(page, 'C4-month');
  });

  test('C5 前後の移動と「今日」', async ({ page }) => {
    await login(page);
    await page.goto('/calendar?view=week&date=2026-09-21');
    await page.getByRole('button', { name: '次へ' }).click();
    await expect(page).toHaveURL(/date=2026-09-28/);
    await page.getByRole('button', { name: '前へ' }).click();
    await expect(page).toHaveURL(/date=2026-09-21/);
    await page.getByRole('button', { name: '今日' }).click();
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
  });

  test('C6 予約カードをタップすると詳細（患者・担当医・手術室）が開く', async ({ page }) => {
    await login(page);
    await page.goto('/calendar?view=day');
    await bookingCards(page).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '予約の詳細' })).toBeVisible();
    for (const label of ['手術日', '時間', '手術', '担当医', '手術室', '患者', 'ステータス']) {
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(dialog.getByRole('button', { name: '編集する' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'この予約をキャンセル' })).toBeVisible();
    await shot(page, 'C6-detail-modal');
    await dialog.getByRole('button', { name: '閉じる' }).last().click();
    await expect(dialog).toBeHidden();
  });

  test('C7 空き枠をタップすると日時・医師・手術室が入った登録画面が開く', async ({ page }) => {
    await login(page);
    await page.goto('/calendar?view=day');
    const gap = page.getByRole('button', { name: /^\+ \d+分$/ }).first();
    const title = await gap.getAttribute('title');
    await gap.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '手術予約を登録' })).toBeVisible();
    await expect(dialog.getByLabel('担当医')).not.toHaveValue('');
    await expect(dialog.getByLabel('手術室')).not.toHaveValue('');
    await expect(dialog.getByLabel('手術日')).toHaveValue(/\d{4}-\d{2}-\d{2}/);
    const start = title?.match(/(\d{2}:\d{2})〜/)?.[1];
    if (start) await expect(dialog.getByLabel('開始時刻')).toHaveValue(start);
    await shot(page, 'C7-gap-to-booking');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
  });
});

/* ================================================================== */
test.describe('D. 空き枠検索（Demo 2・3）', () => {
  test('D1 Demo 2：C手術 × A医師 → 最短枠と根拠', async ({ page }) => {
    await login(page);
    await runSearch(page, 'C手術', ['A医師']);
    const best = page.getByTestId('best-slot');
    await expect(best).toBeVisible();
    await expect(best).toContainText('最短予約可能枠');
    await expect(best).toContainText('A医師');
    await expect(best).toContainText('C手術／枠 60分');
    for (const check of ['A医師はC手術に対応可能', '定例枠', 'が空いている', '既存予約との重複なし']) {
      await expect(best).toContainText(check);
    }
    await expect(best.getByRole('button', { name: 'この枠を予約' })).toBeVisible();

    const others = page.getByText(/^\d+位$/);
    for (const badge of await page.locator('li').filter({ hasText: /位/ }).all()) {
      await expect(badge).toContainText('A医師');
    }
    expect(await others.count()).toBeGreaterThan(0);
    await shot(page, 'D1-search-A');
  });

  test('D2 Demo 3：C手術 × A・B・C医師 → 横断して日時順', async ({ page }) => {
    await login(page);
    await runSearch(page, 'C手術', ['A医師', 'B医師', 'C医師']);
    const best = page.getByTestId('best-slot');
    await expect(best).toBeVisible();

    const countText = await page.getByText(/件の候補が見つかりました/).textContent();
    const total = Number(countText?.match(/(\d+) 件/)?.[1] ?? 0);
    expect(total).toBeGreaterThan(3);

    const names = await page.locator('li').filter({ hasText: /位/ }).allInnerTexts();
    const doctorsSeen = new Set(
      names.flatMap((t) => ['A医師', 'B医師', 'C医師'].filter((d) => t.includes(d)))
    );
    expect(doctorsSeen.size).toBeGreaterThanOrEqual(2);

    const dates = names.map((t) => t.match(/(\d{4}\/\d{2}\/\d{2})/)?.[1] ?? '');
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    await shot(page, 'D2-search-ABC');
  });

  test('D3 指定なし → 対応できる全医師を横断', async ({ page }) => {
    await login(page);
    await runSearch(page, 'C手術');
    await expect(page.getByTestId('best-slot')).toBeVisible();
    await expect(page.getByText(/指定なしの場合はこの手術に対応できる医師（A医師、B医師、C医師、E医師）/)).toBeVisible();
  });

  test('D4 手術室を指定すると候補がその部屋に限定される', async ({ page }) => {
    await login(page);
    await runSearch(page, 'A手術', [], '手術室2');
    const best = page.getByTestId('best-slot');
    await expect(best).toBeVisible();
    await expect(best).toContainText('手術室2');
    for (const row of await page.locator('li').filter({ hasText: /位/ }).all()) {
      await expect(row).toContainText('手術室2');
      await expect(row).not.toContainText('手術室1');
    }
  });

  test('D5 対応できない医師は選べない（H手術＝A医師のみ）', async ({ page }) => {
    await login(page);
    await page.goto('/search');
    await selectSurgery(page, 'H手術');
    await expect(doctorChip(page, 'A医師')).toBeEnabled();
    for (const d of ['B医師', 'C医師', 'D医師', 'E医師']) {
      await expect(doctorChip(page, d)).toBeDisabled();
      await expect(doctorChip(page, d)).toContainText('対応不可');
    }
    await runSearch(page, 'H手術');
    const best = page.getByTestId('best-slot');
    await expect(best).toContainText('A医師');
    await expect(best).toContainText('枠 90分');
    await shot(page, 'D5-H-surgery');
  });

  test('D6 枠のない期間は理由付きで候補なし', async ({ page }) => {
    await login(page);
    await page.goto('/search');
    await selectSurgery(page, 'C手術');
    // 2026-09-26（土）〜27（日）は定例枠がない
    await page.locator('input[type=date]').nth(0).fill('2026-09-26');
    await page.locator('input[type=date]').nth(1).fill('2026-09-27');
    await page.getByRole('button', { name: '空き枠を検索' }).click();
    await expect(page.getByText('条件を満たす空き枠が見つかりませんでした')).toBeVisible();
    await expect(page.getByText(/指定期間内に手術枠がありません/)).toBeVisible();
    await expect(page.getByText('対応可能な医師：')).toBeVisible();
    await shot(page, 'D6-no-result');
  });

  test('D7 第2・第4金曜の追加枠が検索に反映される', async ({ page }) => {
    await login(page);
    await page.goto('/search');
    await selectSurgery(page, 'A手術');
    // 2026-10-09 は第2金曜: 手術室2 に C医師の追加枠がある
    await page.locator('input[type=date]').nth(0).fill('2026-10-09');
    await page.locator('input[type=date]').nth(1).fill('2026-10-09');
    await page.locator('select').nth(1).selectOption({ label: '手術室2' });
    await page.getByRole('button', { name: '空き枠を検索' }).click();
    await expect(page.getByTestId('best-slot')).toContainText('2026/10/09（金）');
    await expect(page.getByTestId('best-slot')).toContainText('手術室2');

    // 2026-10-02 は第1金曜: 手術室2 は開かない
    await page.locator('input[type=date]').nth(0).fill('2026-10-02');
    await page.locator('input[type=date]').nth(1).fill('2026-10-02');
    await page.getByRole('button', { name: '空き枠を検索' }).click();
    await expect(page.getByText('条件を満たす空き枠が見つかりませんでした')).toBeVisible();
  });

  test('D8 「同じ枠内の他の開始時刻」を出すと候補が増える', async ({ page }) => {
    await login(page);
    await runSearch(page, 'A手術');
    const before = await page.locator('li').filter({ hasText: /位/ }).count();
    await page.getByLabel('同じ枠内の他の開始時刻も表示する').check();
    const after = await page.locator('li').filter({ hasText: /位/ }).count();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

/* ================================================================== */
test.describe('E. 予約登録・変更・キャンセル（Demo 4）', () => {
  let bookedKey = '';
  let bookedDate = '';
  let bookedStart = '';
  const patientId = `${TAG}-P1`;

  test('E1 必須項目が空なら登録できない', async ({ page }) => {
    await login(page, STAFF);
    await runSearch(page, 'C手術', ['A医師', 'B医師', 'C医師']);
    await page.getByTestId('best-slot').getByRole('button', { name: 'この枠を予約' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '予約を確定' }).click();
    await expect(dialog.getByText('この内容では保存できません')).toBeVisible();
    await expect(dialog.getByText('患者IDを入力してください')).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
  });

  test('E2 最短枠を予約 → 再検索でその枠が消える', async ({ page }) => {
    await login(page, STAFF);
    await runSearch(page, 'C手術', ['A医師', 'B医師', 'C医師']);
    const best = page.getByTestId('best-slot');
    bookedKey = (await best.getAttribute('data-slot-key'))!;
    [bookedDate, bookedStart] = bookedKey.split('|');

    await best.getByRole('button', { name: 'この枠を予約' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('患者ID').fill(patientId);
    await dialog.getByLabel('患者名').fill('監査用デモ患者');
    await dialog.getByLabel('生年月日').fill('1975-05-05');
    await dialog.getByLabel('備考').fill('自動テストで作成');
    await shot(page, 'E2-booking-form');
    await dialog.getByRole('button', { name: '予約を確定' }).click();
    await expect(dialog).toBeHidden();

    await expect(best).not.toHaveAttribute('data-slot-key', bookedKey);
    await shot(page, 'E2-after-booking');
  });

  test('E3 カレンダーと予約管理に即時反映', async ({ page }) => {
    await login(page, STAFF);
    await page.goto(`/calendar?view=day&date=${bookedDate}`);
    await expect(page.locator(`button[title^="${bookedStart}〜"][title*="監査用デモ患者"]`)).toBeVisible();

    await page.goto(`/bookings?keyword=${patientId}`);
    const row = page.getByRole('row').filter({ hasText: patientId });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('C手術');
    await expect(row).toContainText(bookedStart);
    await expect(row).toContainText('確定');
  });

  test('E4 変更時も重複チェック：枠外の時刻は拒否', async ({ page }) => {
    await login(page, STAFF);
    await page.goto(`/bookings?keyword=${patientId}`);
    await page.getByRole('button', { name: '詳細' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '編集する' }).click();
    const edit = page.getByRole('dialog');
    await expect(edit.getByRole('heading', { name: '予約を変更' })).toBeVisible();
    await edit.getByLabel('開始時刻').fill('06:00');
    await edit.getByRole('button', { name: '変更を保存' }).click();
    await expect(edit.getByText('この内容では保存できません')).toBeVisible();
    await expect(edit.getByText(/手術枠を持っていません/)).toBeVisible();
    await shot(page, 'E4-edit-rejected');
    await edit.getByRole('button', { name: 'キャンセル' }).click();
  });

  test('E5 変更時：既存予約と重なる時刻は理由付きで拒否', async ({ page }) => {
    await login(page, STAFF);
    // 同じ日の別の既存予約の開始時刻へ動かす
    await page.goto(`/calendar?view=day&date=${bookedDate}`);
    const titles = await bookingCards(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('title') ?? '')
    );
    const other = titles.find((t) => !t.includes('監査用デモ患者'));
    const otherStart = other?.match(/^(\d{2}:\d{2})/)?.[1];
    test.skip(!otherStart, 'その日に他の予約がない');

    await page.goto(`/bookings?keyword=${patientId}`);
    await page.getByRole('button', { name: '詳細' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '編集する' }).click();
    const edit = page.getByRole('dialog');
    await edit.getByLabel('開始時刻').fill(otherStart!);
    await edit.getByRole('button', { name: '変更を保存' }).click();
    await expect(edit.getByText('この内容では保存できません')).toBeVisible();
    await expect(edit.getByText(/重複しています|手術枠を持っていません/).first()).toBeVisible();
    await shot(page, 'E5-edit-conflict');
    await edit.getByRole('button', { name: 'キャンセル' }).click();
  });

  test('E6 備考の変更は保存でき、一覧に反映', async ({ page }) => {
    await login(page, STAFF);
    await page.goto(`/bookings?keyword=${patientId}`);
    await page.getByRole('button', { name: '詳細' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '編集する' }).click();
    const edit = page.getByRole('dialog');
    await edit.getByLabel('備考').fill('変更テスト済み');
    await edit.getByRole('button', { name: '変更を保存' }).click();
    await expect(edit).toBeHidden();
    await page.reload();
    await page.getByRole('button', { name: '詳細' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('変更テスト済み');
    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).last().click();
  });

  test('E7 キャンセルすると枠が再び候補に戻る', async ({ page }) => {
    await login(page, STAFF);
    await page.goto(`/bookings?keyword=${patientId}`);
    await page.getByRole('button', { name: '詳細' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'この予約をキャンセル' }).click();
    await expect(dialog.getByText('この予約をキャンセルしますか？')).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセルを確定' }).click();
    await expect(dialog).toBeHidden();

    await page.goto(`/bookings?keyword=${patientId}&status=CANCELLED`);
    await expect(page.getByRole('row').filter({ hasText: patientId })).toContainText('キャンセル');

    await runSearch(page, 'C手術', ['A医師', 'B医師', 'C医師']);
    const keys = await page
      .getByTestId('best-slot')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-slot-key')));
    const others = await page.locator('li').filter({ hasText: /位/ }).allInnerTexts();
    const [d, t] = bookedKey.split('|');
    const dateJa = `${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}`;
    const restored = keys.includes(bookedKey) || others.some((x) => x.includes(dateJa) && x.includes(`${t}〜`));
    expect(restored).toBe(true);
  });
});

/* ================================================================== */
test.describe('F. 予約管理の絞り込み', () => {
  test('F1 ステータス・担当医・キーワード・クリア', async ({ page }) => {
    await login(page);
    await page.goto('/bookings?status=TENTATIVE');
    const rows = page.getByRole('row').filter({ hasText: /デモ患者/ });
    expect(await rows.count()).toBeGreaterThan(0);
    for (const r of await rows.all()) await expect(r).toContainText('仮押さえ');

    await page.goto('/bookings');
    await page.getByLabel('担当医').selectOption({ label: 'A医師' });
    await page.getByRole('button', { name: '絞り込む' }).click();
    await expect(page).toHaveURL(/doctorId=/);
    await expect(page.getByText(/件中 \d+ 件を表示/)).toBeVisible();
    const byDoctor = page.getByRole('row').filter({ hasText: /デモ患者/ });
    expect(await byDoctor.count()).toBeGreaterThan(0);
    for (const r of await byDoctor.all()) {
      await expect(r).toContainText('A医師');
    }

    await page.getByLabel('患者ID・患者名').fill('P00');
    await page.getByRole('button', { name: '絞り込む' }).click();
    await expect(page).toHaveURL(/keyword=P00/);
    await expect(page.getByText(/件中 \d+ 件を表示/)).toBeVisible();
    const filtered = page.getByRole('row').filter({ hasText: /デモ患者/ });
    expect(await filtered.count()).toBeGreaterThan(0);
    for (const r of await filtered.all()) {
      await expect(r).toContainText('P00');
    }

    await page.getByRole('button', { name: '条件をクリア' }).click();
    await expect(page).toHaveURL(/\/bookings$/);
    await shot(page, 'F1-bookings');
  });
});

/* ================================================================== */
test.describe('G. 管理画面（Demo 5 と各マスタ）', () => {
  test('G1 Demo 5：D医師にC手術を追加すると検索に現れる → 元に戻す', async ({ page }) => {
    await login(page);
    await page.goto('/search');
    await selectSurgery(page, 'C手術');
    await expect(doctorChip(page, 'D医師')).toBeDisabled();

    await page.goto('/admin/doctors');
    await page.getByRole('row').filter({ hasText: 'D医師' }).getByRole('button', { name: '編集' }).click();
    const dialog = page.getByRole('dialog');
    const chip = dialog.getByRole('button', { name: /C手術/ });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await shot(page, 'G1-doctor-edit');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: 'D医師' })).toContainText('C手術');

    await page.goto('/search');
    await selectSurgery(page, 'C手術');
    await expect(doctorChip(page, 'D医師')).toBeEnabled();
    await runSearch(page, 'C手術', ['D医師']);
    await expect(page.getByTestId('best-slot')).toContainText('D医師');
    await shot(page, 'G1-search-D');

    await page.goto('/admin/doctors');
    await page.getByRole('row').filter({ hasText: 'D医師' }).getByRole('button', { name: '編集' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /C手術/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: 'D医師' })).not.toContainText('C手術');
  });

  test('G2 手術管理：一覧と検証（予約枠は30分単位・執刀時間以上）', async ({ page }) => {
    await login(page);
    await page.goto('/admin/surgeries');
    for (const s of ['A手術', 'H手術']) await expect(page.getByText(s, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('15分').first()).toBeVisible();
    await expect(page.getByText('90分').first()).toBeVisible();

    await page.getByRole('row').filter({ hasText: 'C手術' }).getByRole('button', { name: '編集' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('予約枠時間（分）').fill('45');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog.getByText(/30分）の倍数にしてください/)).toBeVisible();
    await dialog.getByLabel('予約枠時間（分）').fill('30');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog.getByText(/標準手術時間以上/)).toBeVisible();
    await shot(page, 'G2-surgery-validation');
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
  });

  test('G3 手術室管理：追加 → 一覧 → 削除', async ({ page }) => {
    await login(page);
    await page.goto('/admin/rooms');
    await page.getByRole('button', { name: '新規追加' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('番号').fill('9');
    await dialog.getByLabel('名称').fill(`${TAG}室`);
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: `${TAG}室` });
    await expect(row).toBeVisible();

    await page.getByRole('button', { name: '新規追加' }).click();
    await page.getByRole('dialog').getByLabel('番号').fill('9');
    await page.getByRole('dialog').getByLabel('名称').fill('重複テスト');
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('dialog').getByText(/すでに存在します/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル' }).click();

    await row.getByRole('button', { name: '削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: `${TAG}室` })).toHaveCount(0);
  });

  test('G4 定例枠設定：曜日別表示・追加・重複拒否・削除', async ({ page }) => {
    await login(page);
    await page.goto('/admin/schedules');
    await expect(page.getByText('月曜日').first()).toBeVisible();
    await page.getByRole('button', { name: /^金\s*\d+$/ }).click();
    await expect(page.getByText(/第2週のみ/).first()).toBeVisible();
    await expect(page.getByText(/第4週のみ/).first()).toBeVisible();
    await shot(page, 'G4-schedules-friday');

    await page.getByRole('button', { name: '新規追加' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('医師').selectOption({ label: 'E医師' });
    await dialog.getByLabel('手術室').selectOption({ label: '手術室2' });
    await dialog.getByLabel('曜日').selectOption({ label: '土曜日' });
    await dialog.getByLabel('開始時刻').fill('10:00');
    await dialog.getByLabel('終了時刻').fill('12:00');
    await dialog.getByLabel('週指定').selectOption({ label: '毎週' });
    await dialog.getByLabel('ラベル').fill(TAG);
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: /^土\s*\d+$/ }).click();
    const row = page.getByRole('row').filter({ hasText: TAG });
    await expect(row).toBeVisible();
    await expect(row).toContainText('E医師');
    await expect(row).toContainText('10:00');

    // 同じ手術室・同じ時間帯に別医師 → 拒否
    await page.getByRole('button', { name: '新規追加' }).click();
    const d2 = page.getByRole('dialog');
    await d2.getByLabel('医師').selectOption({ label: 'A医師' });
    await d2.getByLabel('手術室').selectOption({ label: '手術室2' });
    await d2.getByLabel('曜日').selectOption({ label: '土曜日' });
    await d2.getByLabel('開始時刻').fill('11:00');
    await d2.getByLabel('終了時刻').fill('13:00');
    await d2.getByRole('button', { name: '保存' }).click();
    await expect(d2.getByText(/別の定例枠がすでに設定されています/)).toBeVisible();
    await d2.getByRole('button', { name: 'キャンセル' }).click();

    // 検索に土曜の枠が現れる
    await page.goto('/search');
    await selectSurgery(page, 'A手術');
    await page.locator('input[type=date]').nth(0).fill('2026-09-26');
    await page.locator('input[type=date]').nth(1).fill('2026-09-26');
    await page.getByRole('button', { name: '空き枠を検索' }).click();
    await expect(page.getByTestId('best-slot')).toContainText('E医師');
    await expect(page.getByTestId('best-slot')).toContainText('2026/09/26（土）');

    await page.goto('/admin/schedules');
    await page.getByRole('button', { name: /^土\s*\d+$/ }).click();
    await page.getByRole('row').filter({ hasText: TAG }).getByRole('button', { name: '削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: TAG })).toHaveCount(0);
  });

  test('G5 例外日設定：休診を追加すると検索・カレンダーから消える → 削除', async ({ page }) => {
    await login(page);
    // 2026-09-30（水）: 通常なら B医師/手術室1 午前枠がある
    await runSearch(page, 'A手術', ['B医師']);
    await page.locator('input[type=date]').nth(0).fill('2026-09-30');
    await page.locator('input[type=date]').nth(1).fill('2026-09-30');
    await page.getByRole('button', { name: '空き枠を検索' }).click();
    const hadSlots = await page.getByTestId('best-slot').isVisible();

    await page.goto('/admin/exceptions');
    await expect(page.getByText(/院内研修|臨時手術枠/).first()).toBeVisible();
    await page.getByRole('button', { name: '新規追加' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /枠を閉じる/ }).click();
    await dialog.getByLabel('日付').fill('2026-09-30');
    await dialog.getByLabel('理由').fill(`${TAG} 休診`);
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: TAG })).toBeVisible();
    await shot(page, 'G5-exceptions');

    await page.goto('/calendar?view=day&date=2026-09-30');
    await expect(page.getByText(`${TAG} 休診`)).toBeVisible();
    await expect(page.getByText('この日は手術枠が設定されていません')).toBeVisible();

    if (hadSlots) {
      await runSearch(page, 'A手術', ['B医師']);
      await page.locator('input[type=date]').nth(0).fill('2026-09-30');
      await page.locator('input[type=date]').nth(1).fill('2026-09-30');
      await page.getByRole('button', { name: '空き枠を検索' }).click();
      await expect(page.getByText('条件を満たす空き枠が見つかりませんでした')).toBeVisible();
    }

    await page.goto('/admin/exceptions');
    await page.getByRole('row').filter({ hasText: TAG }).getByRole('button', { name: '削除' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '削除する' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('row').filter({ hasText: TAG })).toHaveCount(0);
  });

  test('G6 設定：クリニック名の変更がヘッダーに反映 → 戻す', async ({ page }) => {
    await login(page);
    await page.goto('/admin/settings');
    const input = page.getByLabel('クリニック名');
    const original = await input.inputValue();
    await input.fill(`${original}（${TAG}）`);
    await page.getByRole('button', { name: '設定を保存' }).click();
    await expect(page.getByText('設定を保存しました')).toBeVisible();
    await page.goto('/');
    await expect(page.getByText(`${original}（${TAG}）`).first()).toBeVisible();

    await page.goto('/admin/settings');
    await page.getByLabel('クリニック名').fill(original);
    await page.getByRole('button', { name: '設定を保存' }).click();
    await expect(page.getByText('設定を保存しました')).toBeVisible();
    await expect(page.getByText('本番運用時の留意事項')).toBeVisible();
  });
});

/* ================================================================== */
test.describe('H. 患者向け公開予約表', () => {
  test('H1 未ログインで閲覧でき、個人情報を含まない', async ({ page }) => {
    const res = await page.goto('/schedule');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: '手術予定表' })).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/デモ患者|監査用/);
    expect(body).not.toMatch(/\bP\d{3}\b/);
    expect(body).not.toMatch(/[A-E]医師/);
    expect(body).toMatch(/空き枠あり|満枠/);
    expect(body).toContain('個人情報は一切含まれません');
    await shot(page, 'H1-public');
  });

  test('H2 月の移動', async ({ page }) => {
    await page.goto('/schedule');
    await page.getByRole('link', { name: /次の月/ }).click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    await expect(page.getByText(/^\d{4}年\d{1,2}月$/)).toBeVisible();
  });
});

/* ================================================================== */
test.describe('Z. 後片付け', () => {
  test('Z1 テストで作った予約をすべてキャンセルする', async ({ page }) => {
    await login(page);
    for (const keyword of ['AUDIT', 'E2E-']) {
      for (let i = 0; i < 20; i++) {
        await page.goto(`/bookings?keyword=${keyword}`);
        const rows = page.getByRole('row').filter({ hasText: keyword });
        if ((await rows.count()) === 0) break;
        await rows.first().getByRole('button', { name: '詳細' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'この予約をキャンセル' }).click();
        await dialog.getByRole('button', { name: 'キャンセルを確定' }).click();
        await expect(dialog).toBeHidden();
      }
      await page.goto(`/bookings?keyword=${keyword}`);
      await expect(page.getByRole('row').filter({ hasText: keyword })).toHaveCount(0);
    }
  });
});

/* ================================================================== */
test.describe('I. セキュリティ・運用', () => {
  test('I1 セキュリティヘッダー', async ({ request }) => {
    const res = await request.get('/login');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('same-origin');
    expect(h['strict-transport-security']).toContain('max-age');
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('I2 /api/health が正常', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.database).toBe('ok');
    expect(json.seeded).toBe(true);
    expect(json.timezone).toBe('Asia/Tokyo');
    expect(json.serverNow).toMatch(/^\d{4}\/\d{2}\/\d{2}（.）/);
  });

  test('I3 セッション Cookie の属性', async ({ page, context }) => {
    await login(page);
    const cookie = (await context.cookies()).find((c) => c.name === 'clinic_session');
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.secure).toBe(true);
    expect(cookie!.sameSite).toBe('Lax');
  });
});
