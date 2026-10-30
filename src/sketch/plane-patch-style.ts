/** Shared ghost-plane falloff used by guide leveling and spatial controls. */
export function planePatchMask(id: string, radius: number, fadeStart = 0.35): string {
  return `<radialGradient id="${id}-fade"><stop offset="0" stop-color="white"/><stop offset="${fadeStart}" stop-color="white" stop-opacity="0.9"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><mask id="${id}" maskUnits="userSpaceOnUse" x="${-radius}" y="${-radius}" width="${2 * radius}" height="${2 * radius}"><circle r="${radius}" style="fill:url(#${id}-fade);stroke:none"/></mask>`;
}

export const planePatchFillOpacity = 0.13;

let nextPatch = 0;
/** Sparse local grid with the guide patch's tint, opacity and soft circular boundary. */
export function smallPlanePatch(color: string, radius: number): string {
  const id = `widget-plane-patch-${nextPatch++}`;
  const lines = [-radius / 2, 0, radius / 2]
    .map(
      (offset) => `<path d="M${offset},${-radius} V${radius} M${-radius},${offset} H${radius}"/>`,
    )
    .join("");
  // At twice the original radius, this leaves half the original pixel-width fade band.
  return `<defs>${planePatchMask(id, radius, 0.8375)}</defs><g color="${color}" mask="url(#${id})"><circle r="${radius}" fill="currentColor" opacity="${planePatchFillOpacity * 2}"/><g fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.85">${lines}</g></g>`;
}
