import { expect, test } from '@playwright/test';

test('deux joueurs terminent une manche de dessin', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByTestId('nickname-input').fill('Artiste');
  await host.getByTestId('create-room').click();
  const code = (await host.getByTestId('room-code-display').textContent())!.trim();
  expect(code).toHaveLength(6);
  await expect(host).toHaveURL(new RegExp(`room=${code}`));

  await guest.goto(`/?room=${code}`);
  await guest.getByTestId('nickname-input').fill('Devineur');
  await expect(guest.getByTestId('room-code')).toHaveValue(code);
  await guest.getByTestId('join-room').click();
  await expect(guest.getByTestId('room-code-display')).toHaveText(code);
  await guest.getByTestId('ready-button').click();

  await expect(host.getByTestId('start-game')).toBeEnabled();
  await host.getByTestId('start-game').click();
  const firstChoice = host.getByTestId('champion-choice').first();
  await expect(firstChoice).toBeVisible();
  const championName = (await firstChoice.locator('strong').textContent())!.trim();
  await firstChoice.click();

  const hostCanvas = host.getByTestId('draw-canvas');
  const guestCanvas = guest.getByTestId('draw-canvas');
  await expect(hostCanvas).toBeVisible();
  await expect(guestCanvas).toBeVisible();
  await expect(host.getByRole('button', { name: 'Pinceau' }).locator('svg')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Gomme' }).locator('svg')).toBeVisible();
  await expect(
    host.getByRole('button', { name: 'Remplir toute la toile' }).locator('svg'),
  ).toBeVisible();
  await expect(host.getByTitle('Couleur').locator('svg')).toBeVisible();
  const box = await hostCanvas.boundingBox();
  if (!box) throw new Error('Toile introuvable');
  await host.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await host.mouse.down();
  await host.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.7, { steps: 6 });
  await host.mouse.up();

  await expect
    .poll(() =>
      guestCanvas.evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d');
        if (!context) return false;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] !== 247 || pixels[index + 1] !== 240 || pixels[index + 2] !== 221) {
            return true;
          }
        }
        return false;
      }),
    )
    .toBe(true);

  await host.getByRole('button', { name: 'Effacer' }).click();
  await host.getByLabel('Choisir la couleur').fill('#111111');
  const corners = [
    [0.35, 0.35],
    [0.65, 0.35],
    [0.65, 0.65],
    [0.35, 0.65],
    [0.35, 0.35],
  ] as const;
  await host.mouse.move(box.x + box.width * corners[0][0], box.y + box.height * corners[0][1]);
  await host.mouse.down();
  for (const [x, y] of corners.slice(1)) {
    await host.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 4 });
    await host.waitForTimeout(35);
  }
  await host.mouse.up();

  await host.getByLabel('Choisir la couleur').fill('#22aa44');
  await host.getByRole('button', { name: 'Remplir toute la toile' }).click();
  await hostCanvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await expect
    .poll(() =>
      guestCanvas.evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d');
        if (!context) return '';
        const inside = context.getImageData(canvas.width * 0.5, canvas.height * 0.5, 1, 1).data;
        const outside = context.getImageData(canvas.width * 0.1, canvas.height * 0.1, 1, 1).data;
        return `${[...inside.slice(0, 3)].join(',')}|${[...outside.slice(0, 3)].join(',')}`;
      }),
    )
    .toBe('34,170,68|247,240,221');

  await guest.getByTestId('chat-input').fill(championName);
  await guest.getByTestId('send-chat').click();
  await expect(guest.getByTestId('round-result')).toContainText(championName);
  await expect(host.getByTestId('round-result')).toContainText('Devineur');

  await host.getByTestId('home-logo').click();
  await expect(host.getByTestId('nickname-input')).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test('deux joueurs terminent un tour d’imitation vocale', async ({ browser }) => {
  const hostContext = await browser.newContext({ permissions: ['microphone'] });
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByTestId('nickname-input').fill('Voix');
  await host.getByTestId('create-room').click();
  const code = (await host.getByTestId('room-code-display').textContent())!.trim();
  await host.getByTestId('game-mode').selectOption('voice');
  await expect(host.getByTestId('game-mode')).toHaveValue('voice');
  await host.getByTestId('voice-language').selectOption('en');
  await host.getByTestId('voice-language').selectOption('fr');
  await expect(host.getByTestId('voice-language')).toHaveValue('fr');

  await guest.goto(`/?room=${code}`);
  await guest.getByTestId('nickname-input').fill('Oreille');
  await guest.getByTestId('join-room').click();
  await guest.getByTestId('ready-button').click();
  await host.getByTestId('start-game').click();

  const firstChoice = host.getByTestId('champion-choice').first();
  const championName = (await firstChoice.locator('strong').textContent())!.trim();
  await firstChoice.click();

  await expect(host.getByTestId('voice-performer-stage')).toBeVisible();
  await expect(guest.getByTestId('voice-guesser-stage')).toBeVisible();
  await host.getByRole('button', { name: 'Activer mon micro' }).click();
  await expect(
    host.getByText('Micro actif : les autres joueurs peuvent maintenant vous entendre.'),
  ).toBeVisible();
  await expect(guest.getByText('Voix de l’imitateur connectée.')).toBeVisible({ timeout: 10_000 });
  await expect(host.locator('audio')).toHaveAttribute(
    'src',
    /communitydragon.*\/fr_fr\/v1\/champion-choose-vo\/\d+\.ogg/,
  );
  await expect(host.getByTestId('voice-performer-stage')).toContainText('Le texte apparaît dans');
  await expect(host.getByTestId('voice-performer-stage')).toContainText('À vous de jouer', {
    timeout: 8_000,
  });
  await expect(guest.locator('blockquote')).toHaveCount(0);

  await guest.getByTestId('chat-input').fill(championName);
  await guest.getByTestId('send-chat').click();
  await expect(guest.getByTestId('round-result')).toContainText(championName);

  await hostContext.close();
  await guestContext.close();
});

test('deux joueurs placent leur balise dans HexaMap', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const officialCapture =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#16233d"/></svg>';
  await hostContext.route('https://nexus.leagueoflegends.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: officialCapture }),
  );
  await guestContext.route('https://nexus.leagueoflegends.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: officialCapture }),
  );
  await hostContext.route('https://ddragon.leagueoflegends.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: officialCapture }),
  );
  await guestContext.route('https://ddragon.leagueoflegends.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: officialCapture }),
  );
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByTestId('nickname-input').fill('Boussole');
  await host.getByTestId('create-room').click();
  const code = (await host.getByTestId('room-code-display').textContent())!.trim();
  await host.getByTestId('game-mode').selectOption('map');
  await expect(host.getByText('Faille 85 % · ARAM 10 % · Forêt torturée 5 %')).toBeVisible();

  await guest.goto(`/?room=${code}`);
  await guest.getByTestId('nickname-input').fill('Balise');
  await guest.getByTestId('join-room').click();
  await guest.getByTestId('ready-button').click();
  await host.getByTestId('start-game').click();

  await expect(host.getByTestId('map-stage')).toBeVisible();
  await expect(guest.getByTestId('map-stage')).toBeVisible();
  await expect(host.getByText('Vue verrouillée · aucun déplacement')).toBeVisible();
  const immersiveClue = host.getByTestId('map-stage').locator('img').first();
  await expect(immersiveClue).toHaveAttribute('src', /nexus\.leagueoflegends\.com/);
  await expect(immersiveClue).not.toHaveAttribute('src', /2dlevelminimap/i);
  await expect
    .poll(() => immersiveClue.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  const hostMap = host.getByRole('button', { name: /Carte de réponse/ });
  const guestMap = guest.getByRole('button', { name: /Carte de réponse/ });
  await hostMap.click({ position: { x: 140, y: 140 } });
  await guestMap.click({ position: { x: 80, y: 120 } });
  await host.getByTestId('submit-map-guess').click();
  await guest.getByTestId('submit-map-guess').click();

  await expect(host.getByTestId('round-result')).toContainText('Le lieu était ici');
  await expect(guest.getByTestId('round-result')).toContainText('Précision des balises');

  await hostContext.close();
  await guestContext.close();
});
