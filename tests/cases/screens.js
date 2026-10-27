// Alla menyer och skärmar öppnas utan fel. budget: 15000
runTest(async (t) => {
  save.bank = 50000;
  const screens = [
    ['menu', () => showMenu()], ['shop', () => showShop()], ['customize', () => showCustomize()], ['settings', () => showSettings()], ['help', () => showHelp()],
    ['board', () => showBoard('classic')], ['badges', () => showBadges()], ['characters', () => showCharacters()],
    ['box', () => showBox()], ['party', () => showParty()], ['daily', () => showDaily()],
    ['tutask', () => showOverlay('tutask')], ['reset1', () => showOverlay('reset1')], ['reset2', () => showOverlay('reset2')],
  ];
  for (const [id, open] of screens) {
    open();
    t.ok(!$(id).classList.contains('hidden'), `${id} visas inte`);
  }
  // Byta språk på alla skärmar
  for (const l of Object.keys(LANGS)) {
    save.lang = l;
    applyLanguage();
    showMenu();
  }
  // En låst bana visar upplåsningsknappen
  save.courses = ['classic'];
  setCourse('slalom');
  t.ok($('btn-play').classList.contains('unlock'), 'låst bana visar inte Lås upp');
});
