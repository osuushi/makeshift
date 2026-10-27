"""Cycles startup timelapse, using the canonical icon scene and actual slice."""
from __future__ import annotations

import importlib
import json
import math
from pathlib import Path
import sys
from typing import Any, cast

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from render import bpy, np, Vector, setup  # noqa: E402
from startup_deposition import deposition  # noqa: E402
from startup_plate import create_plate  # noqa: E402
Quaternion: Any = importlib.import_module("mathutils").Quaternion


def composite_fade(directory: Path, frames: list[int]) -> None:
    """Blend fixed-camera render endpoints without stochastic transparency noise."""
    timing = cast(dict[str, Any], json.loads((directory / "source.json").read_text()))
    start, end = timing["plateFadeFrames"]
    images = [bpy.data.images.load(str(directory / "frames" / f"frame-{frame:04}.png"),
                                  check_existing=False) for frame in [start, end]]
    endpoints: list[Any] = []
    for image in images:
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(-1, 4)
        # Loaded byte PNG pixels are display-encoded; float output is scene-linear.
        rgb = pixels[:, :3]
        pixels[:, :3] = np.where(rgb <= 0.04045, rgb / 12.92,
                                ((rgb + 0.055) / 1.055) ** 2.4)
        pixels[:, :3] *= pixels[:, 3:4]
        endpoints.append(pixels)
    output = bpy.data.images.new("Plate fade composite", *images[0].size,
                                 alpha=True, float_buffer=True)
    output.alpha_mode = "PREMUL"
    # Endpoints already contain the approved look/exposure. Only encode linear RGB.
    scene = bpy.data.scenes.new("Fade output")
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    for frame in frames:
        t = (frame - start) / (end - start)
        weight = t * t * (3 - 2 * t)
        pixels = endpoints[0] * (1 - weight) + endpoints[1] * weight
        output.pixels.foreach_set(pixels.ravel())
        output.save_render(str(directory / "frames" / f"frame-{frame:04}.png"), scene=scene)


def animate_camera(scene: Any, fades: list[Any], timing: dict[str, Any]) -> None:
    camera = scene.camera
    camera.rotation_mode = "QUATERNION"
    angle = math.radians(43)
    azimuth = math.atan2(-50, -38)
    offset = Vector((math.sin(angle) * math.cos(azimuth),
                     math.sin(angle) * math.sin(azimuth), math.cos(angle)))
    oblique = (-offset).to_track_quat("-Z", "Y")
    overhead = Quaternion((1, 0, 0, 0))
    for frame in range(1, timing["frames"] + 1):
        start, end = timing["cameraMoveFrames"]
        t = max(0.0, min(1.0, (frame - start) / (end - start)))
        eased = t * t * (3 - 2 * t)
        pullback = max(0.0, min(1.0, (
            frame - timing["pullbackStartFrame"]) / timing["pullbackFrames"]))
        # Ease apparent magnification, not millimeters of ortho scale. The old
        # linear-scale blend spent most of its perceived speed near the close-up.
        pullback = pullback ** 3 * (10 - 15 * pullback + 6 * pullback ** 2)
        seconds = (frame - 1) / timing["fps"]
        drift = Vector((*timing["macroDriftPerSecond"], 0)) * seconds
        # Full-attitude interpolation avoids the overhead look-at singularity.
        camera.rotation_quaternion = oblique.slerp(overhead, eased)
        macro_target = Vector(timing["macroTarget"]) + oblique @ drift
        target = macro_target.lerp(
            Vector((0, 0, 2.4 * (1 - eased))), pullback)
        camera.location = target + camera.rotation_quaternion @ Vector((0, 0, 90))
        start, end = timing["cameraOrthoScale"]
        wide_scale = start + (end - start) * eased
        macro_log_scale = math.log(timing["macroOrthoScale"]) + timing["macroZoomRate"] * seconds
        camera.data.ortho_scale = math.exp(
            macro_log_scale * (1 - pullback) + math.log(wide_scale) * pullback)
        camera.keyframe_insert(data_path="location", frame=frame)
        camera.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        camera.data.keyframe_insert(data_path="ortho_scale", frame=frame)
        for fade in fades:
            start, end = timing["plateFadeFrames"]
            t = max(0.0, min(1.0, (frame - start) / (end - start)))
            fade.default_value = t * t * (3 - 2 * t)
            fade.keyframe_insert(data_path="default_value", frame=frame)


def animate(directory: Path) -> None:
    timing = cast(dict[str, Any], json.loads((directory / "source.json").read_text()))
    setup(directory / "beads.json", directory / "frame.png", timing["resolution"], timing["samples"],
          False, True, "spot-soft", render_still=False)
    deposition(directory)
    fades = create_plate()
    scene = bpy.context.scene
    scene.render.fps = timing["fps"]
    scene.frame_start = 1
    scene.frame_end = timing["frames"]
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 10
    if "--metal" in sys.argv:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "METAL"
        preferences.get_devices()
        if not any(device.type == "METAL" for device in preferences.devices):
            raise RuntimeError("No Metal rendering device available")
        for device in preferences.devices:
            device.use = device.type == "METAL"
        scene.cycles.device = "GPU"
    animate_camera(scene, fades, timing)
    scene.render.filepath = str(directory / "frames" / "frame-")
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / "startup.blend"))
    selected = [arg for arg in sys.argv[sys.argv.index("--") + 2:] if arg != "--metal"]
    frames = list(map(int, selected)) if selected else list(range(1, timing["frames"] + 1))
    start, end = timing["plateFadeFrames"]
    faded = [frame for frame in frames if start < frame < end]
    rendered = {frame for frame in frames if frame <= start or frame >= end}
    if faded:
        rendered.update([start, end])
    for frame in sorted(rendered):
        scene.frame_set(frame)
        scene.render.filepath = str(directory / "frames" / f"frame-{frame:04}.png")
        bpy.ops.render.render(write_still=True)
    if faded:
        composite_fade(directory, faded)


if __name__ == "__main__":
    directory = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    if "--composite-only" in sys.argv:
        timing = json.loads((directory / "source.json").read_text())
        start, end = timing["plateFadeFrames"]
        composite_fade(directory, list(range(start + 1, end)))
    else:
        animate(directory)
