import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
import { GameState } from './state/GameState';
import { sound } from './systems/Sound';
import { IntroScene } from './scenes/IntroScene';
import { BootScene } from './scenes/BootScene';
import { AirportScene } from './scenes/AirportScene';
import { HUDScene } from './scenes/HUDScene';
import { OfficeScene } from './scenes/rooms/OfficeScene';
import { WorkshopScene } from './scenes/rooms/WorkshopScene';
import { TravelAgencyScene } from './scenes/rooms/TravelAgencyScene';
import { BankScene } from './scenes/rooms/BankScene';
import { PersonnelScene } from './scenes/rooms/PersonnelScene';
import { StocksScene } from './scenes/rooms/StocksScene';
import { WorldMapScene } from './scenes/rooms/WorldMapScene';
import { NewsScene } from './scenes/rooms/NewsScene';
import { CargoScene } from './scenes/rooms/CargoScene';
import { DutyFreeScene } from './scenes/rooms/DutyFreeScene';
import { SecurityScene } from './scenes/rooms/SecurityScene';
import { LoungeScene } from './scenes/rooms/LoungeScene';
import { SettingsScene } from './scenes/rooms/SettingsScene';
import { HelpScene } from './scenes/rooms/HelpScene';
import { StatsScene } from './scenes/rooms/StatsScene';
import { NewspaperScene } from './scenes/NewspaperScene';
import { InterventionScene } from './scenes/InterventionScene';
import { GameOverScene } from './scenes/GameOverScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    // Fit the 1280×800 internal resolution into the viewport, preserving
    // aspect ratio. Centering is delegated to the #game flexbox in
    // index.html — using Phaser's CENTER_BOTH at the same time double-
    // centers (Phaser writes inline margins to the canvas, then the
    // flexbox applies its own centering on top), which visibly shifts
    // the game off-center.
    mode: Phaser.Scale.FIT,
  },
  // Force setTimeout-based timing instead of requestAnimationFrame.
  // requestAnimationFrame stops entirely when the tab is hidden;
  // setTimeout is only throttled (to ~1Hz minimum in background tabs)
  // so the game loop continues to tick even when we're in the
  // background. Combined with the HIDDEN-handler override below, this
  // makes flights, the daily Clock, and AI rivals all keep progressing
  // while the player is on another tab.
  fps: {
    forceSetTimeOut: true,
  },
  scene: [
    IntroScene,
    BootScene,
    AirportScene,
    HUDScene,
    OfficeScene,
    WorkshopScene,
    TravelAgencyScene,
    BankScene,
    PersonnelScene,
    StocksScene,
    WorldMapScene,
    NewsScene,
    CargoScene,
    DutyFreeScene,
    SecurityScene,
    LoungeScene,
    SettingsScene,
    HelpScene,
    StatsScene,
    NewspaperScene,
    InterventionScene,
    GameOverScene,
  ],
});

// Tab/window visibility — gated by the `runInBackground` setting.
//
// Phaser auto-pauses its game loop on document.hidden via internal
// HIDDEN/VISIBLE event handlers (loop.pause / loop.resume). With
// forceSetTimeOut + a wake-up call on the HIDDEN event, the loop will
// continue to tick in the background tab (throttled to ~1Hz by the
// browser, but still progressing).
//
// `runInBackground = false` (default): let Phaser pause the loop AND
// suspend music so an unfocused tab is fully quiet.
// `runInBackground = true`: wake the loop after Phaser tries to pause
// it AND leave music playing so the game keeps progressing.
//
// We read the setting at event time rather than at boot so the toggle
// in Settings takes effect immediately without a reload.
game.events.on(Phaser.Core.Events.HIDDEN, () => {
  const runInBg = safeGetRunInBackground();
  if (runInBg) {
    game.loop.wake();
  } else {
    sound.suspendMusic();
  }
});
game.events.on(Phaser.Core.Events.VISIBLE, () => {
  game.loop.wake();
  sound.resumeMusic();
});

/** Read `settings.runInBackground` defensively — GameState might not be
 *  bootstrapped yet on the very first visibility event (rare but
 *  possible if the tab is hidden during initial load). */
function safeGetRunInBackground(): boolean {
  try {
    return GameState.get().settings.runInBackground;
  } catch {
    return false;
  }
}
