import Phaser from 'phaser';
import { PlaneClass } from '../state/catalog';

/**
 * Draw a top-down plane silhouette. Shape varies by class so a Cessna
 * doesn't read identical to a B747:
 *
 * - **turboprop**: shorter / blunter nose, straighter wings, two tiny
 *   prop-disc circles on the wing leading edge.
 * - **narrowbody**: sleek pointed fuselage with swept M-wings (baseline).
 * - **widebody**: longer fatter fuselage, bigger swept wings, four small
 *   engine pods slung under each wing pair, taller tail fin.
 *
 * Size scales by `seats` so within a class a bigger plane is visibly
 * larger. The shape points along +X with the nose forward; the caller
 * sets `rotationRad` to point it down the runway.
 *
 * `withShadow` defaults to true (right for apron contexts). Pass false in
 * list / picker UIs where a shadow under the icon would look odd against
 * a tabular row background.
 */
export function makePlaneIcon(
  scene: Phaser.Scene,
  x: number, y: number, seats: number, color: number,
  rotationRad: number = 0, cls: PlaneClass = 'narrowbody',
  withShadow: boolean = true,
): Phaser.GameObjects.Graphics {
  const size = 4 + Math.sqrt(seats) * 0.6;
  const g = scene.add.graphics({ x, y });
  const s = size;
  if (withShadow) {
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(s * 0.15, s * 0.45, s * 2.6, s * 1.4);
  }
  g.fillStyle(color, 1);
  g.lineStyle(1, 0x000000, 0.7);

  if (cls === 'turboprop') {
    g.beginPath();
    g.moveTo( s * 0.95, s * 0.07);
    g.lineTo( s * 1.0,  0);
    g.lineTo( s * 0.95, -s * 0.07);
    g.lineTo(-s * 0.6,  -s * 0.22);
    g.lineTo(-s * 1.0,  -s * 0.22);
    g.lineTo(-s * 1.0,   s * 0.22);
    g.lineTo(-s * 0.6,   s * 0.22);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.beginPath();
    g.moveTo( s * 0.1,  0);
    g.lineTo(-s * 0.1,  s * 0.85);
    g.lineTo(-s * 0.4,  s * 0.85);
    g.lineTo(-s * 0.2,  0);
    g.lineTo(-s * 0.4, -s * 0.85);
    g.lineTo(-s * 0.1, -s * 0.85);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0x202020, 0.85);
    g.fillCircle(-s * 0.05,  s * 0.55, s * 0.13);
    g.fillCircle(-s * 0.05, -s * 0.55, s * 0.13);
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(-s * 0.85, 0);
    g.lineTo(-s * 1.0,  s * 0.4);
    g.lineTo(-s * 1.05, s * 0.4);
    g.lineTo(-s * 0.95, 0);
    g.lineTo(-s * 1.05, -s * 0.4);
    g.lineTo(-s * 1.0, -s * 0.4);
    g.closePath();
    g.fillPath();
    g.strokePath();
  } else if (cls === 'widebody') {
    g.beginPath();
    g.moveTo( s * 1.4,  0);
    g.lineTo(-s * 0.6,  s * 0.26);
    g.lineTo(-s * 1.1,  s * 0.26);
    g.lineTo(-s * 1.1, -s * 0.26);
    g.lineTo(-s * 0.6, -s * 0.26);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.beginPath();
    g.moveTo( s * 0.1,  0);
    g.lineTo(-s * 0.5,  s * 1.15);
    g.lineTo(-s * 0.7,  s * 1.15);
    g.lineTo(-s * 0.4,  0);
    g.lineTo(-s * 0.7, -s * 1.15);
    g.lineTo(-s * 0.5, -s * 1.15);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0x202020, 0.85);
    g.fillEllipse(-s * 0.15,  s * 0.55, s * 0.32, s * 0.16);
    g.fillEllipse(-s * 0.40,  s * 0.95, s * 0.28, s * 0.14);
    g.fillEllipse(-s * 0.15, -s * 0.55, s * 0.32, s * 0.16);
    g.fillEllipse(-s * 0.40, -s * 0.95, s * 0.28, s * 0.14);
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(-s * 0.95, 0);
    g.lineTo(-s * 1.2,  s * 0.5);
    g.lineTo(-s * 1.3,  s * 0.5);
    g.lineTo(-s * 1.1,  0);
    g.lineTo(-s * 1.3, -s * 0.5);
    g.lineTo(-s * 1.2, -s * 0.5);
    g.closePath();
    g.fillPath();
    g.strokePath();
  } else {
    g.beginPath();
    g.moveTo( s * 1.2,  0);
    g.lineTo(-s * 0.6,  s * 0.18);
    g.lineTo(-s * 1.0,  s * 0.18);
    g.lineTo(-s * 1.0, -s * 0.18);
    g.lineTo(-s * 0.6, -s * 0.18);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.beginPath();
    g.moveTo( s * 0.0,  0);
    g.lineTo(-s * 0.4,  s * 0.95);
    g.lineTo(-s * 0.6,  s * 0.95);
    g.lineTo(-s * 0.3,  0);
    g.lineTo(-s * 0.6, -s * 0.95);
    g.lineTo(-s * 0.4, -s * 0.95);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.beginPath();
    g.moveTo(-s * 0.85, 0);
    g.lineTo(-s * 1.1,  s * 0.4);
    g.lineTo(-s * 1.2,  s * 0.4);
    g.lineTo(-s * 1.0,  0);
    g.lineTo(-s * 1.2, -s * 0.4);
    g.lineTo(-s * 1.1, -s * 0.4);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
  g.rotation = rotationRad;
  return g;
}
