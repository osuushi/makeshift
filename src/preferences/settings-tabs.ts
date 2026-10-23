export function settingsTabs(entries: [string, HTMLElement][]): HTMLElement {
  const container = document.createElement("div");
  container.className = "settings-pages";
  const tabs = document.createElement("div");
  tabs.className = "settings-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Settings categories");
  container.append(tabs);
  const buttons = entries.map(([name, panel], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.id = `settings-tab-${index}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `settings-panel-${index}`);
    panel.id = `settings-panel-${index}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.tabIndex = 0;
    button.onclick = () => select(index);
    button.onkeydown = (event) => {
      const next =
        event.key === "ArrowRight"
          ? (index + 1) % entries.length
          : event.key === "ArrowLeft"
            ? (index + entries.length - 1) % entries.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? entries.length - 1
                : null;
      if (next === null) return;
      event.preventDefault();
      select(next);
      buttons[next].focus();
    };
    tabs.append(button);
    container.append(panel);
    return button;
  });
  function select(index: number): void {
    buttons.forEach((button, i) => {
      button.setAttribute("aria-selected", String(i === index));
      button.tabIndex = i === index ? 0 : -1;
      entries[i][1].hidden = i !== index;
    });
  }
  select(0);
  return container;
}
