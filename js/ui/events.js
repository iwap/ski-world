'use strict';
// Knapparnas kopplingar (laddas sist, när alla funktioner finns).

$('btn-play').addEventListener('click', startRun);
$('btn-shop').addEventListener('click', showShop);
$('btn-shop-back').addEventListener('click', showMenu);
$('btn-shop-play').addEventListener('click', startRun);
$('btn-again').addEventListener('click', () => (dailyAgain ? startDaily() : startRun()));
$('btn-go-shop').addEventListener('click', showShop);
$('btn-go-menu').addEventListener('click', showMenu);
$('btn-resume').addEventListener('click', togglePause);
$('btn-quit').addEventListener('click', () => {
  player.crashReason = t('go.quitReason');
  player.quit = true;
  endRun();
});
$('btn-board').addEventListener('click', () => showBoard());
$('btn-start').addEventListener('click', leaveIntro);
$('btn-lift-skip').addEventListener('click', () => { if (state === 'lift') endLift(); });
// Nollställ allt: två varningsskärmar, sedan rensas allt utom språket
$('btn-reset').addEventListener('click', () => showOverlay('reset1'));
$('btn-reset1-no').addEventListener('click', showSettings);
$('btn-reset1-yes').addEventListener('click', () => showOverlay('reset2'));
$('btn-reset2-no').addEventListener('click', showSettings);
$('btn-reset2-yes').addEventListener('click', () => {
  // Språket behålls, och tutorial-frågan visas bara första gången någonsin
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ lang: save.lang, tutorialSeen: true })); } catch { /* privat läge */ }
  location.reload();
});
$('course-prev').addEventListener('click', () => cycleCourse(-1));
$('course-next').addEventListener('click', () => cycleCourse(1));
$('course-card').addEventListener('click', startRun); // klick på kortet = åk den banan
$('lb-select').addEventListener('change', (e) => showBoard(e.target.value));
for (const mode of ['global', 'local']) $('lb-mode').append(segButton('', { mode }, () => setBoardMode(mode)));
$('btn-settings').addEventListener('click', showSettings);
$('btn-help').addEventListener('click', showHelp);
$('btn-characters').addEventListener('click', showCharacters);
$('btn-badges').addEventListener('click', showBadges);
$('btn-party').addEventListener('click', showParty);
$('btn-daily').addEventListener('click', showDaily);
$('btn-daily-back').addEventListener('click', showMenu);
$('btn-daily-go').addEventListener('click', () => startDaily());
$('btn-daily-ghost-me').addEventListener('click', () => {
  const g = save.dailyGhost;
  if (g && g.day === dayKey()) startDaily({ data: g.data, name: t('daily.myGhost') });
});
$('btn-rematch').addEventListener('click', rematch);
$('btn-sessres-rematch').addEventListener('click', rematch);
$('btn-sessres-menu').addEventListener('click', showMenu);
$('btn-party-back').addEventListener('click', showMenu);
$('btn-inv-yes').addEventListener('click', () => answerInvite(true));
$('btn-inv-no').addEventListener('click', () => answerInvite(false));
$('btn-badges-back').addEventListener('click', showMenu);
$('btn-claim-all').addEventListener('click', () => {
  const open = BADGES.filter((b) => save.badges[b.id] === 'earned');
  if (!open.length) return Sound.denied();
  for (const b of open) {
    save.badges[b.id] = 'claimed';
    save.bank += b.reward;
  }
  persist();
  Sound.combo(5);
  keepFocus('badges', renderBadges);
});
$('btn-chars-back').addEventListener('click', () => { applyLook(); showMenu(); });
$('btn-box').addEventListener('click', showBox);
$('btn-box-spin').addEventListener('click', spinBox);
$('btn-box-equip').addEventListener('click', equipBoxResult);
$('btn-box-back').addEventListener('click', () => { if (!boxSpinning) showCharacters(); });
$('char-grid').addEventListener('mouseleave', () => {
  const f = document.activeElement && document.activeElement.dataset.char;
  previewCharacter(CHARACTERS.find((c) => c.id === f) || currentCharacter());
});
$('btn-settings-back').addEventListener('click', showMenu);
$('btn-help-back').addEventListener('click', showMenu);
$('btn-tutorial').addEventListener('click', startTutorial);
$('btn-tut-yes').addEventListener('click', startTutorial);
$('btn-tut-no').addEventListener('click', () => {
  save.tutorialSeen = true;
  persist();
  showMenu();
});
$('btn-tut-skip').addEventListener('click', () => endTutorial());
$('btn-music').addEventListener('click', () => setAudio('music', !save.audio.music));
$('btn-sfx').addEventListener('click', () => setAudio('sfx', !save.audio.sfx));
updateAudioButtons();
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && !btn.closest('#shop-items, #shop-styles')) Sound.click();
});
$('btn-go-board').addEventListener('click', () => showBoard());
$('btn-lb-back').addEventListener('click', showMenu);
$('rider-ski').addEventListener('click', () => setRider('ski'));
$('rider-board').addEventListener('click', () => setRider('board'));
$('sens-input').addEventListener('input', (e) => {
  save.turnSens = Number(e.target.value) / 100;
  persist();
  updateSensLabel();
});
