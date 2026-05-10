export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 800;

export const COLORS = {
  bg: 0x0e1a2b,
  floor: 0x14304a,
  wall: 0x1c4063,
  wallLight: 0x2a5780,
  room: 0x2d4a6a,
  roomHover: 0x3d6a92,
  roomBorder: 0x88c0e0,
  text: '#e8eef5',
  textDim: '#9bb0c4',
  accent: 0xffc857,
  accentText: '#ffc857',
  danger: 0xff5566,
  good: 0x66dd88,
  panel: 0x0b1a2c,
  panelBorder: 0x88c0e0,
};

// 1 game minute = N real ms. Original game's clock runs faster than real time.
export const MS_PER_GAME_MINUTE = 200; // 1 game hour = 12s, 1 game day = ~5 min
