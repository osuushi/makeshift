/** Keep the instruction concrete; don't wrap it in generic requirements language. */
export function unavailableHelp(reason: string): string {
  const explanations: Record<string, string> = {
    "Enter sketch mode": "Start or edit a sketch to use this tool.",
    "Already in Modeling":
      "You’re already in Modeling. Use this after opening a sketch to return here.",
    "Isolation is not active":
      "Nothing is isolated. Select an object and choose Isolate selection first.",
    "No export is running":
      "There’s no export to cancel. You can use this while a file is being exported.",
    "Bodies are already shown":
      "The bodies are already visible. Use this to show them again after hiding them.",
    "Bodies are already hidden":
      "The bodies are already hidden. Use this to hide them again after showing them.",
    "Switching tools…": "Wait for the tool change to finish.",
    "Exporting…": "Wait for the export to finish, or cancel it before starting another.",
    "Capturing fixture…": "Wait for the current capture to finish.",
    "Create a body first": "Create or import a solid body first.",
    "Create or show a solid body first": "Create, import, or show a solid body to export.",
    "Open a sketch containing curves":
      "Open a sketch with lines or curves, or draw some in a new sketch.",
    "Select solid geometry in Modeling":
      "Choose Return to Modeling, then select a body, face, or edge.",
    "Select a closed profile or solid face":
      "Select a closed sketch shape or a face on a solid body.",
    "Select a closed profile or planar face":
      "Select a closed sketch shape or a flat face on a solid body.",
    "Select one planar solid face": "Select one flat face on a solid body.",
    "Select a sketch or its filled region":
      "Select a sketch or click inside one of its closed shapes.",
    "Select an object or its geometry first": "Select an object, face, or edge first.",
  };
  return explanations[reason] ?? `${reason.replace(/[.…]+$/, "")}.`;
}
