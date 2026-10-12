import { wifiDetail, wifiWarning } from "./protocol.js";

export class ConnectionScreen {
  readonly root = document.createElement("section");
  readonly status = document.createElement("p");
  readonly action = document.createElement("button");
  constructor(title: string, action: string) {
    this.root.className = "ipad-connection";
    const heading = document.createElement("h1");
    heading.textContent = title;
    const warning = document.createElement("strong");
    warning.className = "wifi-warning";
    warning.textContent = wifiWarning;
    const detail = document.createElement("p");
    detail.className = "wifi-detail";
    detail.textContent = wifiDetail;
    this.status.setAttribute("role", "status");
    this.action.textContent = action;
    this.root.append(heading, warning, detail, this.status, this.action);
    document.body.append(this.root);
  }
}
export function installTabletChrome(app: HTMLElement): void {
  if (!window.makeshiftRemote) return;
  const warning = document.createElement("div");
  warning.className = "wifi-banner";
  warning.textContent = wifiWarning;
  warning.title = wifiDetail;
  app.append(warning);
}
