import Phaser from 'phaser';
import { GameStats } from '../state/GameState';
import { formatMoney } from '../systems/Clock';
import { COLORS } from '../config';

/**
 * Render the stats grid into a Phaser scene at (x, y), returning the y
 * coordinate immediately below the rendered block. Used by both
 * StatsScene (live, mid-run) and GameOverScene (final, end-of-run) so
 * the layout matches across both contexts.
 *
 * Caller's scene needs only the standard `add.text` API; no container
 * is required.
 */
export function renderStatsBlock(
  scene: Phaser.Scene,
  x: number,
  y: number,
  stats: GameStats,
  container?: Phaser.GameObjects.Container,
): number {
  // Two-column grid. Each row is [label, value] pairs.
  const rows: Array<[string, string]> = [
    ['Days played',          stats.daysPlayed.toLocaleString('en-US')],
    ['Flights completed',    stats.flights.toLocaleString('en-US')],
    ['Passengers flown',     stats.passengers.toLocaleString('en-US')],
    ['Kilometers flown',     Math.round(stats.km).toLocaleString('en-US')],
    ['Total revenue',        formatMoney(stats.revenue)],
    ['Total fuel spent',     formatMoney(stats.fuel)],
    ['Best single flight',   formatMoney(stats.bestFlightProfit)],
    ['Worst single flight',  formatMoney(stats.worstFlightLoss)],
    ['Crashes',              stats.crashes.toLocaleString('en-US')],
    ['Incidents',            stats.incidents.toLocaleString('en-US')],
    ['Routes opened',        stats.routesOpened.toLocaleString('en-US')],
    ['Planes bought',        stats.planesBought.toLocaleString('en-US')],
    ['Hubs bought',          stats.hubsBought.toLocaleString('en-US')],
    ['Peak net worth',       formatMoney(stats.peakNetWorth)],
  ];

  // Two-column layout. Left column gets the first half, right the rest.
  const half = Math.ceil(rows.length / 2);
  const colWidth = 420;
  const rowHeight = 26;

  for (let i = 0; i < rows.length; i++) {
    const col = i < half ? 0 : 1;
    const idxInCol = i < half ? i : i - half;
    const cx = x + col * colWidth;
    const cy = y + idxInCol * rowHeight;
    const label = scene.add.text(cx, cy, rows[i][0], {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color: COLORS.textDim,
    });
    const value = scene.add.text(cx + 200, cy, rows[i][1], {
      fontFamily: 'Segoe UI, Tahoma, sans-serif',
      fontSize: '13px',
      color: COLORS.text,
    });
    if (container) {
      container.add(label);
      container.add(value);
    }
  }

  return y + half * rowHeight + 12;
}
