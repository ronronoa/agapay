import { test, expect } from '@playwright/test';
async function login(page, role) {
  await page.goto('/login');
  await page.locator('input[type=email]').fill(`m4-e2e-${role}@example.com`);
  await page.locator('input[type=password]').fill('M4 browser test only');
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await page.waitForURL(role === 'donor' ? '**/donor' : '**/admin');
}
test('staff creates, edits, cancels a calendar event and sees distribution history', async ({
  page,
}, testInfo) => {
  await login(page, 'staff');
  await page.goto('/admin/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  if (testInfo.project.name === 'mobile')
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title', { exact: true }).fill(`Browser calendar ${Date.now()}`);
  await dialog.getByLabel('Event type').selectOption('DONATION_DRIVE');
  const campaign = dialog.getByLabel('Campaign', { exact: true });
  await campaign.selectOption({ label: 'M4 browser fixture' });
  await dialog.getByLabel('Location', { exact: true }).fill('M4 test hall');
  await dialog.getByRole('button', { name: 'Save event' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'Browser calendar' }).last().click();
  await expect(page.getByText('Google sync disabled')).toBeVisible();
  await page.getByRole('button', { name: 'Edit event' }).click();
  await page.getByLabel('Location', { exact: true }).fill('Updated test hall');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save event' }).click();
  await expect(page.getByText('Updated test hall', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel event', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByText('donation drive · cancelled', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/admin/distributions');
  await expect(page.getByRole('heading', { name: 'Distributions', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Schedule beneficiary' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
for (const role of ['admin', 'donor'])
  test(`${role} calendar access is enforced`, async ({ page }) => {
    await login(page, role);
    await page.goto('/admin/calendar');
    if (role === 'donor') await expect(page).toHaveURL(/forbidden/);
    else await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  });

test('donated goods reach a beneficiary through scheduling and partial handover', async ({
  page,
  request,
}) => {
  const api = async (path, data, token) => {
    const response = await request.post(`/api/v1${path}`, {
      data,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).data;
  };
  const staff = await api('/auth/login', {
    email: 'm4-e2e-staff@example.com',
    password: 'M4 browser test only',
  });
  const donor = await api('/auth/login', {
    email: 'm4-e2e-donor@example.com',
    password: 'M4 browser test only',
  });
  const headers = { authorization: `Bearer ${staff.accessToken}` };
  const campaigns = (
    await (await request.get('/api/v1/campaigns?q=M4%20browser%20fixture', { headers })).json()
  ).data.items;
  const campaign = campaigns.find((c) => c.slug === 'm4-browser-fixture');
  const types = (await (await request.get('/api/v1/item-types?pageSize=100', { headers })).json())
    .data.items;
  const item = types.find((i) => i.name === 'M4 browser hygiene');
  const donation = await api(
    '/donations',
    { campaignId: campaign.id, items: [{ itemTypeId: item.id, quantityDeclared: 20 }] },
    donor.accessToken,
  );
  await api(`/donations/${donation.id}/verify`, {}, staff.accessToken);
  await api(
    `/donations/${donation.id}/collect`,
    { items: [{ donationItemId: donation.items[0].id, quantityReceived: 20 }] },
    staff.accessToken,
  );
  const email = `m4-browser-${Date.now()}@example.com`;
  const received = await api('/public/assistance-requests', {
    fullName: 'Browser test beneficiary',
    email,
    contactNumber: '09171234567',
    barangay: 'Test barangay',
    city: 'Test city',
    province: 'Test province',
    campaignId: campaign.id,
    items: [{ itemTypeId: item.id, quantity: 5 }],
    consent: true,
    turnstileToken: 'local-test-only',
  });
  const requests = (
    await (
      await request.get(`/api/v1/assistance-requests?q=${received.referenceNumber}`, { headers })
    ).json()
  ).data.items;
  const beneficiary = requests[0];
  await api(`/assistance-requests/${beneficiary.id}/claim`, {}, staff.accessToken);
  const approved = await api(
    `/assistance-requests/${beneficiary.id}/approve`,
    {},
    staff.accessToken,
  );
  const event = await api(
    '/calendar/events',
    {
      campaignId: campaign.id,
      type: 'DISTRIBUTION',
      title: `Browser handover ${Date.now()}`,
      location: 'Test distribution hall',
      startAt: new Date(Date.now() + 172800000).toISOString(),
      endAt: new Date(Date.now() + 183600000).toISOString(),
      capacity: 1,
    },
    staff.accessToken,
  );
  await login(page, 'staff');
  await page.goto(`/admin/distributions?event=${event.id}&request=${beneficiary.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reserve M4 browser hygiene', { exact: true }).fill('5');
  await dialog.getByRole('button', { name: 'Reserve and schedule' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'View distribution' }).click();
  await page.getByRole('button', { name: 'Record handover' }).click();
  await page.getByLabel('Received by', { exact: true }).fill('Browser test recipient');
  await page.getByLabel('Handed over: M4 browser hygiene (reserved 5)', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('distributed');
  const tracked = await api('/public/track', { code: approved.trackingNumber, email });
  expect(tracked.status).toBe('DISTRIBUTED');
});
