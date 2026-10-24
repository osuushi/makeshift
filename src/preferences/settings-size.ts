export interface SettingsSize {
  tab: string;
  width: number;
  height: number;
  minimumHeight: number;
  maximumHeight: number;
}
interface AvailableSize {
  width: number;
  height: number;
}

/** Measure a hidden natural-flow copy once, without resizing the live window. */
export function measureSettings(dialog: HTMLDialogElement, available: AvailableSize): SettingsSize {
  const copy = dialog.cloneNode(true) as HTMLDialogElement;
  copy.classList.add("settings-measure", "settings-measure-width");
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  copy.style.width = "max-content";
  dialog.ownerDocument.body.append(copy);
  try {
    const tab = copy.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
    const strip = copy.querySelector<HTMLElement>(".settings-tabs");
    if (!tab || !strip) throw new Error("Missing selected Settings tab");
    const style = getComputedStyle(copy);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const row = copy.querySelector<HTMLElement>(
      '[role="tabpanel"]:not([hidden]) .settings-interface',
    );
    const panel = row?.closest<HTMLElement>('[role="tabpanel"]');
    const gutter = panel ? panel.offsetWidth - panel.clientWidth : 0;
    const naturalWidth = Math.max(
      strip.getBoundingClientRect().width,
      (row?.getBoundingClientRect().width ?? 0) + gutter,
    );
    let width = Math.min(available.width, Math.ceil(naturalWidth + padding));
    copy.classList.remove("settings-measure-width");
    copy.style.width = `${width}px`;
    width = Math.min(available.width, width + Math.max(0, copy.scrollWidth - copy.clientWidth));
    copy.style.width = `${width}px`;
    if (tab === "Toolbox") return measureToolbox(copy, tab, width);
    width = fittingWidth(copy, width, available);
    const height = Math.ceil(copy.getBoundingClientRect().height) + 1;
    return { tab, width, height, minimumHeight: height, maximumHeight: height };
  } finally {
    copy.remove();
  }
}

/** Use more width only when it lets the complete pane fit a shorter display. */
function fittingWidth(copy: HTMLElement, width: number, available: AvailableSize): number {
  const naturalHeight = copy.getBoundingClientRect().height;
  if (naturalHeight <= available.height || width >= available.width) return width;
  copy.style.width = `${available.width}px`;
  const widestHeight = copy.getBoundingClientRect().height;
  if (widestHeight >= naturalHeight) {
    copy.style.width = `${width}px`;
    return width;
  }
  const targetHeight = Math.max(available.height - 1, widestHeight);
  let low = width,
    high = available.width;
  while (high - low > 1) {
    const middle = Math.ceil((low + high) / 2);
    copy.style.width = `${middle}px`;
    if (copy.getBoundingClientRect().height <= targetHeight) high = middle;
    else low = middle;
  }
  copy.style.width = `${high}px`;
  return high;
}

function measureToolbox(copy: HTMLElement, tab: string, width: number): SettingsSize {
  const tree = copy.querySelector<HTMLElement>(".toolbox-settings-tree");
  if (!tree) throw new Error("Missing Settings toolbox tree");
  const rows = [...tree.children].filter((node) => node.matches(".toolbox-row"));
  const prefixHeight = (count: number) => {
    const row = rows[Math.min(count, rows.length) - 1];
    if (!row) return tree.scrollHeight;
    const children = row.nextElementSibling;
    const end = children?.matches(".toolbox-tree-children") ? children : row;
    return Math.ceil(end.getBoundingClientRect().bottom - tree.getBoundingClientRect().top);
  };
  // Minimum: Select and Transform. Preferred: also show the first editable group.
  const minimum = prefixHeight(2),
    preferred = prefixHeight(3),
    full = tree.scrollHeight;
  tree.style.height = `${preferred}px`;
  const height = Math.ceil(copy.getBoundingClientRect().height) + 1;
  const chrome = height - preferred;
  return { tab, width, height, minimumHeight: chrome + minimum, maximumHeight: chrome + full };
}
