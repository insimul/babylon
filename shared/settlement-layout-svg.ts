/**
 * Shared settlement layout SVG data generator.
 *
 * Produces street line and building rectangle data for a settlement's
 * street pattern, suitable for rendering as SVG or drawing on a canvas.
 *
 * Used by:
 *   - SettlementDialog.tsx (SVG preview)
 *   - LocationMapPreview.tsx (country-zoom miniature footprints)
 */

import { selectStreetPattern, GRID_SIZE, type LayoutPattern } from '@shared/street-pattern-selection';

export interface StreetLine {
  x1: number; y1: number;
  x2: number; y2: number;
  main?: boolean;
}

export interface BuildingRect {
  x: number; y: number;
  w: number; h: number;
  biz?: boolean;
}

export interface SettlementLayoutData {
  streets: StreetLine[];
  buildings: BuildingRect[];
  park: { x: number; y: number; w: number; h: number } | null;
  pattern: LayoutPattern;
}

/**
 * Generate layout data for a settlement.
 * @param width  Canvas/SVG width
 * @param height Canvas/SVG height
 * @param settlementType hamlet | village | town | city
 * @param terrain  plains | coast | river | mountains | etc.
 * @param foundedYear Founding year (affects organic selection)
 * @param population Optional population for pattern selection
 */
export function generateSettlementLayout(
  width: number,
  height: number,
  settlementType: string,
  terrain: string,
  foundedYear: number = 1900,
  population?: number,
): SettlementLayoutData {
  const pattern = selectStreetPattern({ settlementType, foundedYear, population });

  const W = width;
  const H = height;
  const cx = W / 2;
  const cy = H / 2;
  const bw = 4;
  const bh = 4;

  const gridSize = GRID_SIZE[settlementType] ?? 6;
  const blocks = (gridSize - 1) * (gridSize - 1);
  const buildingCount = Math.max(4, (blocks - 1) * 6);

  const streets: StreetLine[] = [];
  const buildings: BuildingRect[] = [];
  let park: { x: number; y: number; w: number; h: number } | null = null;

  switch (pattern) {
    case 'grid': {
      const cols = gridSize - 1;
      const rows = gridSize - 1;
      const streetW = cols <= 3 ? 3 : cols <= 5 ? 2 : 1.5;
      const blockW = (W - (cols + 1) * streetW) / cols;
      const blockH = (H - (rows + 1) * streetW) / rows;
      const ox = streetW;
      const oy = streetW;

      for (let c = 0; c <= cols; c++) {
        const sx = ox + c * (blockW + streetW) - streetW / 2;
        streets.push({ x1: sx, y1: 0, x2: sx, y2: H, main: c === 0 || c === cols });
      }
      for (let r = 0; r <= rows; r++) {
        const sy = oy + r * (blockH + streetW) - streetW / 2;
        streets.push({ x1: 0, y1: sy, x2: W, y2: sy, main: r === 0 || r === rows });
      }

      const parkCol = Math.floor(cols / 2);
      const parkRow = Math.floor(rows / 2);
      let placed = 0;
      const inset = Math.max(0.5, blockW * 0.08);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx0 = ox + c * (blockW + streetW);
          const by0 = oy + r * (blockH + streetW);
          if (r === parkRow && c === parkCol) {
            park = { x: bx0 + 1, y: by0 + 1, w: blockW - 2, h: blockH - 2 };
            continue;
          }
          const lotW = (blockW - inset * 2) / 3;
          const lotH = (blockH - inset * 2) / 2;
          const bldgW = lotW * 0.75;
          const bldgH = lotH * 0.75;
          for (let lr = 0; lr < 2; lr++) {
            for (let lc = 0; lc < 3; lc++) {
              if (placed >= buildingCount) break;
              buildings.push({
                x: bx0 + inset + lc * lotW + (lotW - bldgW) / 2,
                y: by0 + inset + lr * lotH + (lotH - bldgH) / 2,
                w: bldgW, h: bldgH,
                biz: placed < Math.ceil(buildingCount * 0.3),
              });
              placed++;
            }
          }
        }
      }
      break;
    }
    case 'linear': {
      streets.push({ x1: 10, y1: cy, x2: W - 10, y2: cy, main: true });
      const sideCount = settlementType === 'hamlet' ? 2 : settlementType === 'village' ? 3 : 5;
      for (let i = 0; i < sideCount; i++) {
        const sx = 30 + i * ((W - 60) / Math.max(1, sideCount - 1));
        streets.push({ x1: sx, y1: cy - 30, x2: sx, y2: cy + 30 });
      }
      let placed = 0;
      const perSide = Math.ceil(buildingCount / 2);
      const sp = Math.min(bw + 1.5, (W - 20) / perSide);
      for (let side = 0; side < 2 && placed < buildingCount; side++) {
        const by = side === 0 ? cy - bh - 3 : cy + 3;
        for (let i = 0; i < perSide && placed < buildingCount; i++) {
          buildings.push({ x: 12 + i * sp, y: by, w: bw, h: bh, biz: placed < 4 });
          placed++;
        }
      }
      break;
    }
    case 'waterfront': {
      const shoreY = 20;
      streets.push({ x1: 10, y1: shoreY + 15, x2: W - 10, y2: shoreY + 15, main: true });
      streets.push({ x1: 15, y1: shoreY + 40, x2: W - 15, y2: shoreY + 40 });
      for (let i = 0; i < 5; i++) {
        const sx = 25 + i * (W - 50) / 4;
        streets.push({ x1: sx, y1: shoreY + 5, x2: sx, y2: H - 5 });
      }
      let placed = 0;
      for (let row = 0; row < 3 && placed < buildingCount; row++) {
        const by = shoreY + 19 + row * 25;
        const cols = Math.floor((W - 30) / (bw + 1.5));
        for (let i = 0; i < cols && placed < buildingCount; i++) {
          buildings.push({ x: 15 + i * (bw + 1.5), y: by, w: bw, h: bh, biz: placed < 5 });
          placed++;
        }
      }
      break;
    }
    case 'hillside': {
      const terraces = settlementType === 'hamlet' ? 3 : settlementType === 'village' ? 4 : 5;
      const terraceH = (H - 15) / terraces;
      for (let t = 0; t < terraces; t++) {
        const ty = 8 + t * terraceH;
        const indent = t * 10;
        streets.push({ x1: 10 + indent, y1: ty, x2: W - 10 - indent, y2: ty, main: t === 0 });
      }
      let placed = 0;
      for (let t = 0; t < terraces && placed < buildingCount; t++) {
        const ty = 11 + t * terraceH;
        const indent = t * 10;
        const rowW = W - 20 - indent * 2;
        const perRow = Math.max(1, Math.floor(rowW / (bw + 1.5)));
        for (let i = 0; i < perRow && placed < buildingCount; i++) {
          buildings.push({ x: 12 + indent + i * (bw + 1.5), y: ty, w: bw, h: bh, biz: placed < 3 });
          placed++;
        }
      }
      break;
    }
    case 'organic': {
      const mainPts = [
        { x: 12, y: cy + 10 },
        { x: cx * 0.55, y: cy - 18 },
        { x: cx, y: cy + 6 },
        { x: cx * 1.45, y: cy - 12 },
        { x: W - 12, y: cy + 4 },
      ];
      for (let i = 0; i < mainPts.length - 1; i++)
        streets.push({ x1: mainPts[i].x, y1: mainPts[i].y, x2: mainPts[i + 1].x, y2: mainPts[i + 1].y, main: true });

      const sideLanes = [
        { x1: cx * 0.55, y1: cy - 18, x2: cx * 0.35, y2: 10 },
        { x1: cx * 0.55, y1: cy - 18, x2: cx * 0.7, y2: H - 10 },
        { x1: cx, y1: cy + 6, x2: cx - 15, y2: H - 8 },
        { x1: cx, y1: cy + 6, x2: cx + 20, y2: 10 },
        { x1: cx * 1.45, y1: cy - 12, x2: cx * 1.55, y2: H - 12 },
      ];
      for (const sl of sideLanes) streets.push(sl);

      let placed = 0;
      for (const seg of streets) {
        if (placed >= buildingCount) break;
        const sdx = seg.x2 - seg.x1;
        const sdy = seg.y2 - seg.y1;
        const slen = Math.sqrt(sdx * sdx + sdy * sdy);
        if (slen < 8) continue;
        const snx = -sdy / slen;
        const sny = sdx / slen;
        const step = Math.max(bw + 0.5, slen / Math.ceil(slen / (bw + 1)));
        const steps = Math.floor(slen / step);
        for (let side = -1; side <= 1; side += 2) {
          const offset = side * (bw * 0.6 + 1);
          for (let s = 0; s < steps && placed < buildingCount; s++) {
            const t = (s + 0.5) / steps;
            const bx = seg.x1 + sdx * t + snx * offset - bw / 2;
            const by = seg.y1 + sdy * t + sny * offset - bh / 2;
            if (bx > 1 && bx < W - bw - 1 && by > 1 && by < H - bh - 1) {
              buildings.push({ x: bx, y: by, w: bw, h: bh, biz: placed < Math.ceil(buildingCount * 0.25) });
              placed++;
            }
          }
        }
      }
      break;
    }
    case 'radial': {
      const spokeCount = settlementType === 'city' ? 8 : 6;
      const ringCount = settlementType === 'city' ? 4 : 3;
      const maxR = Math.min(cx, cy) - 4;
      const centerR = 8;

      for (let s = 0; s < spokeCount; s++) {
        const angle = (s / spokeCount) * Math.PI * 2;
        streets.push({
          x1: cx + Math.cos(angle) * centerR,
          y1: cy + Math.sin(angle) * centerR * 0.75,
          x2: cx + Math.cos(angle) * maxR,
          y2: cy + Math.sin(angle) * maxR * 0.75,
          main: s % Math.floor(spokeCount / 2) === 0,
        });
      }
      for (let r = 1; r <= ringCount; r++) {
        const ringR = centerR + (maxR - centerR) * (r / ringCount);
        for (let s = 0; s < spokeCount; s++) {
          const a1 = (s / spokeCount) * Math.PI * 2;
          const a2 = ((s + 1) / spokeCount) * Math.PI * 2;
          streets.push({
            x1: cx + Math.cos(a1) * ringR,
            y1: cy + Math.sin(a1) * ringR * 0.75,
            x2: cx + Math.cos(a2) * ringR,
            y2: cy + Math.sin(a2) * ringR * 0.75,
          });
        }
      }

      let placed = 0;
      for (let r = 0; r < ringCount && placed < buildingCount; r++) {
        const innerR = centerR + (maxR - centerR) * (r / ringCount);
        const outerR = centerR + (maxR - centerR) * ((r + 1) / ringCount);
        const midR = (innerR + outerR) / 2;
        const spotsPerWedge = Math.max(1, Math.floor((midR * Math.PI * 2 / spokeCount) / (bw + 1)));
        for (let s = 0; s < spokeCount && placed < buildingCount; s++) {
          const a1 = (s / spokeCount) * Math.PI * 2;
          const a2 = ((s + 1) / spokeCount) * Math.PI * 2;
          for (let b = 0; b < spotsPerWedge && placed < buildingCount; b++) {
            const t = (b + 0.5) / spotsPerWedge;
            const angle = a1 + (a2 - a1) * t;
            buildings.push({
              x: cx + Math.cos(angle) * midR - bw / 2,
              y: cy + Math.sin(angle) * midR * 0.75 - bh / 2,
              w: bw, h: bh, biz: placed < Math.ceil(buildingCount * 0.3),
            });
            placed++;
          }
        }
      }
      park = { x: cx - centerR, y: cy - centerR * 0.75, w: centerR * 2, h: centerR * 1.5 };
      break;
    }
  }

  return { streets, buildings, park, pattern };
}
