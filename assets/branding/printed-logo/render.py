"""Blender 4.0 background renderer. Geometry uses millimeters as scene units."""
from __future__ import annotations

import importlib
import json
import math
from pathlib import Path
import sys
from typing import Any, cast

# Blender owns these APIs; keep the dynamic boundary out of typed helper inputs.
bpy: Any = importlib.import_module("bpy")
Vector: Any = importlib.import_module("mathutils").Vector
np: Any = importlib.import_module("numpy")
ICON_THICKNESS_SCALE = 0.6


def linear(hex_color: str) -> tuple[float, float, float, float]:
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return cast(tuple[float, float, float, float], tuple(
        v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        for v in rgb) + (1.0,))


def footprint_mask(region: dict[str, Any], bounds: list[list[float]]) -> Any:
    size = 1024
    pixels = np.zeros((size, size, 4), dtype=np.float32)
    pixels[:, :, 3] = 1
    for triangle in region["triangles"]:
        points = np.array(triangle).reshape(3, 2)
        minimum = np.floor((points.min(axis=0) - np.array(bounds)[:, 0]) /
                           (np.array(bounds)[:, 1] - np.array(bounds)[:, 0]) * size).astype(int)
        maximum = np.ceil((points.max(axis=0) - np.array(bounds)[:, 0]) /
                          (np.array(bounds)[:, 1] - np.array(bounds)[:, 0]) * size).astype(int)
        x0, y0 = np.maximum(minimum, 0)
        x1, y1 = np.minimum(maximum, size)
        xs = bounds[0][0] + (np.arange(x0, x1) + 0.5) / size * (bounds[0][1] - bounds[0][0])
        ys = bounds[1][0] + (np.arange(y0, y1) + 0.5) / size * (bounds[1][1] - bounds[1][0])
        xx, yy = np.meshgrid(xs, ys)
        crosses = [(points[(i + 1) % 3, 0] - points[i, 0]) * (yy - points[i, 1]) -
                   (points[(i + 1) % 3, 1] - points[i, 1]) * (xx - points[i, 0])
                   for i in range(3)]
        inside = np.logical_or(np.logical_and.reduce([c >= -1e-7 for c in crosses]),
                               np.logical_and.reduce([c <= 1e-7 for c in crosses]))
        pixels[y0:y1, x0:x1, :3][inside] = 1
    mask = bpy.data.images.new(f"Inset footprint {region['body']}", size, size, float_buffer=True)
    mask.colorspace_settings.name = "Non-Color"
    mask.pixels.foreach_set(pixels.ravel())
    mask.pack()
    return mask


def inset_color(nodes: Any, links: Any, coordinates: Any, color: str,
                region: dict[str, Any], bounds: list[list[float]]) -> Any:
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = (1 / (bounds[0][1] - bounds[0][0]),
                                     1 / (bounds[1][1] - bounds[1][0]), 0)
    links.new(coordinates, scale.inputs[0])
    shift = nodes.new("ShaderNodeVectorMath")
    shift.operation = "ADD"
    shift.inputs[1].default_value = (-bounds[0][0] / (bounds[0][1] - bounds[0][0]),
                                    -bounds[1][0] / (bounds[1][1] - bounds[1][0]), 0)
    links.new(scale.outputs["Vector"], shift.inputs[0])
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = footprint_mask(region, bounds)
    texture.extension = "CLIP"
    links.new(shift.outputs["Vector"], texture.inputs["Vector"])
    xyz = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coordinates, xyz.inputs[0])
    gates: list[Any] = []
    for operation, limit in [("GREATER_THAN", region["minZ"] - 1e-6),
                             ("LESS_THAN", region["maxZ"] + 1e-6)]:
        gate = nodes.new("ShaderNodeMath")
        gate.operation = operation
        links.new(xyz.outputs["Z"], gate.inputs[0])
        gate.inputs[1].default_value = limit
        gates.append(gate.outputs[0])
    value = texture.outputs["Color"]
    for gate in gates:
        multiply = nodes.new("ShaderNodeMath")
        multiply.operation = "MULTIPLY"
        links.new(value, multiply.inputs[0])
        links.new(gate, multiply.inputs[1])
        value = multiply.outputs[0]
    mix = nodes.new("ShaderNodeMixRGB")
    mix.inputs[1].default_value = linear(color)
    mix.inputs[2].default_value = linear(region["color"])
    links.new(value, mix.inputs[0])
    return mix.outputs["Color"]


def plastic(name: str, color: str, icon: bool, insets: list[dict[str, Any]],
            bounds: list[list[float]]) -> Any:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = linear(color)
    bsdf.inputs["Roughness"].default_value = 0.31
    bsdf.inputs["IOR"].default_value = 1.46
    bsdf.inputs["Coat Weight"].default_value = 0.08
    bsdf.inputs["Coat Roughness"].default_value = 0.28
    tex = nodes.new("ShaderNodeTexCoord")
    for region in insets:
        links.new(inset_color(nodes, links, tex.outputs["Object"], color, region, bounds),
                  bsdf.inputs["Base Color"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 22
    noise.inputs["Detail"].default_value = 2
    noise.inputs["Roughness"].default_value = 0.55
    links.new(tex.outputs["Object"], noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.012
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    normal = bump.outputs["Normal"]
    if icon:
        # Preserve bead shading relief after thinning the object; shadows use actual geometry.
        compensate = nodes.new("ShaderNodeVectorMath")
        compensate.operation = "MULTIPLY"
        compensate.inputs[1].default_value = (1, 1, ICON_THICKNESS_SCALE)
        links.new(normal, compensate.inputs[0])
        normalize = nodes.new("ShaderNodeVectorMath")
        normalize.operation = "NORMALIZE"
        links.new(compensate.outputs["Vector"], normalize.inputs[0])
        normal = normalize.outputs["Vector"]
    links.new(normal, bsdf.inputs["Normal"])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.inputs["To Min"].default_value = 0.22 if icon else 0.27
    ramp.inputs["To Max"].default_value = 0.30 if icon else 0.36
    links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])
    return material


def area(name: str, location: tuple[float, float, float],
         power: float, size: float, target: tuple[float, float, float],
         color: tuple[float, float, float] = (1, 1, 1), height: float | None = None) -> None:
    light = bpy.data.lights.new(name, "AREA")
    light.energy = power
    light.color = color
    light.shape = "DISK" if height is None else "RECTANGLE"
    light.size = size
    if height is not None:
        light.size_y = height
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def spot(spec: dict[str, Any], location: tuple[float, float, float],
         target: tuple[float, float, float]) -> None:
    light = bpy.data.lights.new(spec["name"], "SPOT")
    light.energy = spec["power"]
    light.color = tuple(spec["color"])
    light.spot_size = math.radians(spec["coneDegrees"])
    light.spot_blend = spec["blend"]
    light.shadow_soft_size = spec["radius"]
    obj = bpy.data.objects.new(spec["name"], light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def lighting(scene: Any, icon: bool, base_height: float, preset: str) -> None:
    if preset != "current":
        presets = cast(dict[str, Any], json.loads(Path(__file__).with_name("lighting.json").read_text()))
        if not icon or preset not in presets:
            raise ValueError(f"Unknown icon lighting preset: {preset}")
        rig = presets[preset]
        scene.world.use_nodes = True
        background = scene.world.node_tree.nodes.get("Background")
        background.inputs["Color"].default_value = (*rig["ambientColor"], 1)
        background.inputs["Strength"].default_value = rig["ambientStrength"]
        target_height = base_height * ICON_THICKNESS_SCALE
        for spec in rig["lights"]:
            x, y, z = spec["position"]
            tx, ty, tz = spec.get("target", [0, 0, 0])
            location = (x, y, z + target_height)
            target = (tx, ty, tz + target_height)
            if spec.get("type") == "SPOT":
                spot(spec, location, target)
            else:
                area(spec["name"], location, spec["power"], spec["width"],
                     target, tuple(spec["color"]), spec.get("height"))
        return
    scene.world.color = (0.07, 0.07, 0.07) if icon else (0.32, 0.32, 0.32)
    if icon:
        key_height = base_height * ICON_THICKNESS_SCALE
        fill_height = base_height * ICON_THICKNESS_SCALE / 2
        # Ten times farther from each target: scale diameter by 10 and power by 100.
        area("Distant top-left key", (-280, 320, 320 + key_height),
             5000000, 100, (0, 0, key_height))
        area("Distant soft fill", (280, -80, 320 + fill_height),
             800000, 360, (0, 0, fill_height))
    else:
        area("Upper-left softbox", (-24, 30, 48), 52000, 36, (0, 0, 3))
        area("Right fill", (28, 8, 35), 14000, 32, (0, 0, 3))
        area("Bottom broad fill", (0, -32, 28), 9000, 28, (0, 0, 3))


def setup(mesh_file: Path, output: Path, resolution: int, samples: int,
          detail: bool, icon: bool, lighting_preset: str) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    data = cast(dict[str, Any], json.loads(mesh_file.read_text()))
    base_height = float(data.get("baseHeight", 6))
    mesh = bpy.data.meshes.new("G-code deposited beads")
    mesh.from_pydata(data["vertices"], [], data["faces"])
    mesh.update()
    obj = bpy.data.objects.new("Makeshift — simulated deposition", mesh)
    bpy.context.collection.objects.link(obj)
    if icon:
        obj.scale.z = ICON_THICKNESS_SCALE
    palette = cast(list[dict[str, str]], data.get("palette", [
        {"name": "Warm white PLA", "color": "ECECE8"},
        {"name": "Orange PLA", "color": "FF6808"},
        {"name": "Violet PLA", "color": "630AC2"},
    ]))
    regions = cast(list[dict[str, Any]], data.get("colorRegions", []))
    for entry in palette:
        insets = [dict(region, color=palette[int(region["material"])]["color"])
                  for region in regions
                  if region["maxZ"] <= base_height] if entry is palette[0] else []
        bounds = cast(list[list[float]], data.get("maskBounds", [[-20, 20], [-20, 20]]))
        obj.data.materials.append(plastic(entry["name"], entry["color"], icon, insets, bounds))
    for polygon, material in zip(mesh.polygons, data["materials"]):
        polygon.material_index = material
        polygon.use_smooth = True
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.render.film_transparent = True
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -1.3
    camera = bpy.data.cameras.new("Orthographic icon camera")
    camera.type = "ORTHO"
    camera.ortho_scale = 44
    camera_obj = bpy.data.objects.new("Orthographic icon camera", camera)
    bpy.context.collection.objects.link(camera_obj)
    camera_obj.location = (0, 0, 90)
    camera_obj.rotation_euler = (0, 0, 0)
    if detail:
        camera.ortho_scale = 57
        camera_obj.location = (-38 if icon else 38, -50, 62)
        target_height = base_height * ICON_THICKNESS_SCALE if icon else 4
        camera_obj.rotation_euler = (Vector((0, 0, target_height)) - camera_obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera_obj
    lighting(scene, icon, base_height, lighting_preset)
    scene.render.filepath = str(output)
    bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix(".blend")))
    bpy.ops.render.render(write_still=True)


args = sys.argv[sys.argv.index("--") + 1:]
lighting_preset = next((arg.split("=", 1)[1] for arg in args[4:] if arg.startswith("lighting=")),
                      "spot-soft" if "icon" in args[4:] else "current")
setup(Path(args[0]), Path(args[1]), int(args[2]) if len(args) > 2 else 1024,
      int(args[3]) if len(args) > 3 else 64, "detail" in args[4:], "icon" in args[4:], lighting_preset)
