/** Explain state-only guards; selection guards already name the required input. */
export function unavailableHelp(reason: string): string {
  const explanations: Record<string, string> = {
    "Enter sketch mode": "This tool needs a sketch workspace. Start or edit a sketch to enable it.",
    "Already in Modeling":
      "You are already in Modeling. This becomes available after you enter a sketch.",
    "Isolation is not active":
      "Nothing is isolated. Use Isolate selection first to enable Exit isolation.",
    "No export is running":
      "There is no export to cancel. This becomes available while an export is running.",
    "Bodies are already shown":
      "Bodies are already visible. Hide bodies first to enable Show bodies.",
    "Bodies are already hidden":
      "Bodies are already hidden. Show bodies first to enable Hide bodies.",
    "That relationship already exists":
      "This constraint is already applied. Select geometry without that relationship to apply it elsewhere.",
    "Switching tools…": "A tool change is in progress. Wait for it to finish.",
    "Exporting…":
      "An export is in progress. Wait for it to finish or cancel it before starting another.",
    "Capturing fixture…": "A fixture capture is in progress. Wait for it to finish.",
    "Create a body first": "The document has no solid bodies. Create or import a solid body first.",
    "Create or show a solid body first":
      "Export needs a visible solid body. Create, import, or show a body first.",
    "Open a sketch containing curves":
      "This tool needs sketch curves. Open a sketch containing curves, or start a sketch and draw some.",
  };
  if (explanations[reason]) return explanations[reason];
  if (reason.startsWith("Return to Modeling"))
    return `This tool needs the Modeling workspace. ${reason}.`;
  if (/^Select .* in Modeling$/.test(reason))
    return `This tool needs the Modeling workspace. Use Return to Modeling, then ${reason[0].toLowerCase()}${reason.slice(1)}.`;
  if (/^Select .*sketch|^Select two circles or arcs/.test(reason))
    return `This tool needs compatible sketch geometry. Start or edit a sketch, then ${reason[0].toLowerCase()}${reason.slice(1)}.`;
  if (reason.startsWith("Select "))
    return `The current selection does not meet this tool’s requirements. ${reason}.`;
  // Other catalog guards already give a concrete action (finish, wait, open, remove…).
  return `${reason.replace(/[.…]+$/, "")}.`;
}
