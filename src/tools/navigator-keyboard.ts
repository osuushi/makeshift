export function navigatorKeydown(
  event: KeyboardEvent,
  panel: HTMLElement,
  choose: (id: string) => void,
): void {
  const buttons = [...panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (
    [
      "Escape",
      "Tab",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Enter",
      " ",
      "Backspace",
    ].includes(event.key)
  )
    event.preventDefault();
  if (event.key === "Escape") choose("cancel");
  else if (event.key === "Backspace") choose("back");
  else if (event.key === "Enter" || event.key === " ") {
    const id = (document.activeElement as HTMLElement)?.dataset.entry;
    if (id) choose(id);
  } else {
    const delta = (
      {
        Tab: event.shiftKey ? -1 : 1,
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -3,
        ArrowDown: 3,
      } as Record<string, number>
    )[event.key];
    if (delta) buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  }
}
