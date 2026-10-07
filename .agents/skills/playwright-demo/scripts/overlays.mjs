export async function overlays(page) {
  await page.evaluate(() => {
    const caption = document.createElement("div");
    caption.id = "demo-caption";
    caption.style.cssText =
      "position:fixed;left:245px;right:18px;bottom:16px;z-index:10000;pointer-events:none;background:#17283eee;color:white;border-radius:12px;padding:10px 14px;font:12px system-ui;line-height:1.4";
    document.body.append(caption);
    const pointer = document.createElement("div");
    pointer.style.cssText =
      "position:fixed;left:-50px;top:-50px;width:14px;height:14px;border:2px solid #ed9a25;border-radius:50%;background:#f5b53544;transform:translate(-50%,-50%);z-index:10001;pointer-events:none";
    document.body.append(pointer);
    document.addEventListener(
      "pointermove",
      (event) => {
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      () => {
        pointer.style.background = "#ed9a25aa";
      },
      true,
    );
    document.addEventListener(
      "pointerup",
      () => {
        pointer.style.background = "#f5b53544";
      },
      true,
    );
  });
}

export async function label(page, title, detail) {
  await page.evaluate(
    ({ title, detail }) => {
      const caption = document.getElementById("demo-caption");
      caption.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = title;
      heading.style.cssText = "display:block;font-size:17px";
      const text = document.createElement("div");
      text.textContent = detail;
      text.style.cssText = "color:#c6d5e7;margin-top:3px";
      caption.append(heading, text);
    },
    { title, detail },
  );
}
