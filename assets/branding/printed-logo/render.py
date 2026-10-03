"""Blender 4.0 background renderer. Geometry uses millimeters as scene units."""
from __future__ import annotations

import importlib
import json
from pathlib import Path
import sys
from typing import Any, cast

# Blender owns these APIs; keep the dynamic boundary out of typed helper inputs.
bpy: Any = importlib.import_module("bpy")
Vector: Any = importlib.import_module("mathutils").Vector


def linear(hex_color: str) -> tuple[float, float, float, float]:
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return cast(tuple[float, float, float, float], tuple(
        v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        for v in rgb) + (1.0,))


def plastic(name: str, color: str, icon: bool) -> Any:
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
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 22
    noise.inputs["Detail"].default_value = 2
    noise.inputs["Roughness"].default_value = 0.55
    links.new(tex.outputs["Object"], noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.012
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.inputs["To Min"].default_value = 0.22 if icon else 0.27
    ramp.inputs["To Max"].default_value = 0.30 if icon else 0.36
    links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])
    return material


def area(name: str, location: tuple[float, float, float],
         power: float, size: float, target: tuple[float, float, float]) -> None:
    light = bpy.data.lights.new(name, "AREA")
    light.energy = power
    light.shape = "DISK"
    light.size = size
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def lighting(scene: Any, icon: bool) -> None:
    scene.world.color = (0.07, 0.07, 0.07) if icon else (0.32, 0.32, 0.32)
    if icon:
        area("Grazing key across print lines", (-28, -32, 38), 50000, 10, (0, 0, 6))
        area("Soft restrained fill", (28, 8, 35), 8000, 36, (0, 0, 3))
    else:
        area("Upper-left softbox", (-24, 30, 48), 52000, 36, (0, 0, 3))
        area("Right fill", (28, 8, 35), 14000, 32, (0, 0, 3))
        area("Bottom broad fill", (0, -32, 28), 9000, 28, (0, 0, 3))


def setup(mesh_file: Path, output: Path, resolution: int, samples: int,
          detail: bool, icon: bool) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    data = cast(dict[str, Any], json.loads(mesh_file.read_text()))
    mesh = bpy.data.meshes.new("G-code deposited stadium beads")
    mesh.from_pydata(data["vertices"], [], data["faces"])
    mesh.update()
    obj = bpy.data.objects.new("Makeshift — simulated deposition", mesh)
    bpy.context.collection.objects.link(obj)
    for name, color in [("Warm white PLA", "ECECE8"),
                        ("Orange PLA", "FF6808"), ("Violet PLA", "630AC2")]:
        obj.data.materials.append(plastic(name, color, icon))
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
        camera_obj.location = (38, -50, 62)
        camera_obj.rotation_euler = (Vector((0, 0, 4)) - camera_obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera_obj
    lighting(scene, icon)
    scene.render.filepath = str(output)
    bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix(".blend")))
    bpy.ops.render.render(write_still=True)


args = sys.argv[sys.argv.index("--") + 1:]
setup(Path(args[0]), Path(args[1]), int(args[2]) if len(args) > 2 else 1024,
      int(args[3]) if len(args) > 3 else 64, "detail" in args[4:], "icon" in args[4:])
