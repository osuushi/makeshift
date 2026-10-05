/** Report state from our isolated test app before cleanup; never relax a failed assertion. */
export async function failureContext(page, errors) {
  try {
    return await page.evaluate((pageErrors) => {
      const state = window.makeshiftInspect?.();
      return {
        pageErrors,
        busy: state?.busy,
        interaction: state?.interaction,
        activePlane: state?.activePlane,
        cameraMoving: state?.camera?.moving,
        camera: state?.camera,
        tool: state?.tool,
        activeSketch: state?.activeSketch,
        curveSelection: state?.selectionTargets,
        profilePickTrace: window.makeshiftUiPickTrace ?? [],
        acceptedSketches: state?.document?.sketches?.map(({ id, plane, curves, groups }) => ({
          id,
          plane: { origin: plane.origin, u: plane.u, v: plane.v },
          curves,
          groups,
        })),
        selection: state?.modelingSelection,
        acceptedVolumes: state?.document?.bodies?.map(({ id, volume }) => ({ id, volume })),
        previewVolumes: state?.preview?.bodies?.map(({ id, volume }) => ({ id, volume })),
        commands: state?.commands?.filter((command) => command.unavailable),
        status: document.querySelector('[role="status"]')?.textContent,
        focused: document.activeElement?.getAttribute("aria-label"),
        fields: [...document.querySelectorAll("input[aria-label]")].map((input) => ({
          label: input.getAttribute("aria-label"),
          value: input.value,
          invalid: input.getAttribute("aria-invalid"),
          disabled: input.disabled,
        })),
      };
    }, errors);
  } catch (error) {
    return { pageErrors: errors, inspectionError: String(error) };
  }
}
