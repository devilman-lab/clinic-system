import { expect, test, type Page } from '@playwright/test';

/** 表示名は「C手術（45分 / 枠60分）」のように可変なので、option の value を引いて選ぶ。 */
async function selectSurgery(page: Page, name: string) {
  const select = page.getByTestId('surgery-select');
  const value = await select
    .locator('option')
    .filter({ hasText: name })
    .first()
    .getAttribute('value');
  await select.selectOption(value!);
}

async function login(page: Page, username = 'staff', password = 'staff123') {
  await page.goto('/login');
  await page.getByLabel('ユーザーID').fill(username);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'サインイン' }).click();
  await expect(page).toHaveURL('/');
}

test.describe('手術予約の中核フロー', () => {
  test('C手術をA・B・C医師で横断検索し、予約するとその枠が候補から消える', async ({ page }) => {
    await login(page);

    await page.goto('/search');
    await expect(page.getByRole('heading', { name: '空き枠検索' })).toBeVisible();

    await selectSurgery(page, 'C手術');

    for (const doctor of ['A医師', 'B医師', 'C医師']) {
      await page.getByRole('button', { name: doctor, exact: false }).first().click();
    }

    await page.getByRole('button', { name: '空き枠を検索' }).click();

    const best = page.getByTestId('best-slot');
    await expect(best).toBeVisible();

    const bookedKey = await best.getAttribute('data-slot-key');
    expect(bookedKey).toBeTruthy();

    // 候補には検索の根拠が明示されている
    await expect(best).toContainText('既存予約との重複なし');
    await expect(best).toContainText('C手術');

    await best.getByRole('button', { name: 'この枠を予約' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const patientId = `E2E-${Date.now()}`;
    await dialog.getByLabel('患者ID').fill(patientId);
    await dialog.getByLabel('患者名').fill('デモ患者E2E');
    await dialog.getByLabel('生年月日').fill('1980-01-01');

    await dialog.getByRole('button', { name: '予約を確定' }).click();

    await expect(dialog).toBeHidden();

    // 予約確定後は同条件で自動的に再検索され、押さえた枠は候補から外れる
    await expect(best).not.toHaveAttribute('data-slot-key', bookedKey!);

    const [dateKey, startTime] = bookedKey!.split('|');

    // 予約管理から、登録した予約が実在することを確認する
    await page.goto(`/bookings?keyword=${patientId}`);
    const row = page.getByRole('row').filter({ hasText: patientId });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(dateKey);
    await expect(row).toContainText(startTime);

    // カレンダーにも反映されている
    await page.goto(`/calendar?view=day&date=${dateKey}`);
    await expect(page.getByRole('button', { name: new RegExp(startTime) }).first()).toBeVisible();
  });

  test('対応できない医師を選ぶと、理由とともに候補なしが示される', async ({ page }) => {
    await login(page);
    await page.goto('/search');

    await selectSurgery(page, 'H手術');

    // H手術に対応していない医師のボタンは押せない状態になっている
    const dDoctor = page.getByRole('button', { name: 'D医師', exact: false }).first();
    await expect(dDoctor).toBeDisabled();
  });

  test('予約の重複は変更時にも検出される', async ({ page }) => {
    await login(page);
    await page.goto('/bookings');

    await page.getByRole('button', { name: '詳細' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '編集する' }).click();

    const editDialog = page.getByRole('dialog');
    await expect(editDialog.getByRole('heading', { name: '予約を変更' })).toBeVisible();

    // 手術枠のない早朝へ動かすと、保存時に理由付きで拒否される
    await editDialog.getByLabel('開始時刻').fill('06:00');
    await editDialog.getByRole('button', { name: '変更を保存' }).click();

    await expect(editDialog.getByText('この内容では保存できません')).toBeVisible();
  });
});

test.describe('患者向け公開予約表', () => {
  test('ログインなしで閲覧でき、患者個人情報を含まない', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.getByRole('heading', { name: '手術予定表' })).toBeVisible();

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('デモ患者');
    expect(body).not.toMatch(/\bP0\d{2}\b/);
    expect(body).toContain('個人情報は一切含まれません');
  });
});

test.describe('権限分離', () => {
  test('スタッフは管理画面へ入れない', async ({ page }) => {
    await login(page);
    await page.goto('/admin/doctors');
    await expect(page).toHaveURL('/');
  });

  test('管理者は管理画面へ入れる', async ({ page }) => {
    await login(page, 'admin', 'admin123');
    await page.goto('/admin/doctors');
    await expect(page.getByRole('heading', { name: '医師管理' })).toBeVisible();
  });
});
