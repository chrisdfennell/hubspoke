import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
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

new Phaser.Game({
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
  scene: [
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
