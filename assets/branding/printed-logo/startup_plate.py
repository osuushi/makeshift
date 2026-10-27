"""Understated build plate following the founder's stepped-outline reference."""
from __future__ import annotations

from typing import Any
from render import bpy


def outline_solid(name: str, outline: list[tuple[float, float]],
                  top: float, depth: float) -> Any:
    count = len(outline)
    vertices = [(x, y, z) for z in [top - depth, top] for x, y in outline]
    faces = [list(reversed(range(count))), list(range(count, count * 2))]
    faces.extend([[i, (i + 1) % count, (i + 1) % count + count, i + count]
                  for i in range(count)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def finish(obj: Any, gray: float) -> Any:
    bevel = obj.modifiers.new("Soft manufactured edges", "BEVEL")
    bevel.width = 0.16
    bevel.segments = 3
    material = bpy.data.materials.new(obj.name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (gray, gray, gray, 1)
    bsdf.inputs["Roughness"].default_value = 0.8
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    material.node_tree.links.new(bsdf.outputs[0], mix.inputs[1])
    material.node_tree.links.new(transparent.outputs[0], mix.inputs[2])
    material.node_tree.links.new(mix.outputs[0], nodes.get("Material Output").inputs["Surface"])
    obj.data.materials.append(material)
    return mix.inputs[0]


def create_plate() -> list[Any]:
    # Reference: broad shallow upper rise and an asymmetric lower-left step.
    outline = [(-82.5, -82.5), (-66, -82.5), (-62, -90.75), (82.5, -90.75),
               (82.5, 82.5), (51.5, 82.5), (46.5, 88.5), (-46.5, 88.5),
               (-51.5, 82.5), (-82.5, 82.5)]
    base = outline_solid("Stepped gray build plate", outline, -0.03, 2.4)
    return [finish(base, 0.255)]
