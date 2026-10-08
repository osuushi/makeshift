# pyright: strict
"""Relink existing CMake application objects with an isolated OCCT library pair.

Python's shlex handles the generated link command without shell interpolation.
This helper performs no compilation and is called only under the build script lock.
"""

import pathlib
import shlex
import subprocess
import sys


def main(arguments: list[str]) -> None:
    if len(arguments) != 3:
        raise SystemExit("Expected APP_BUILD EXPERIMENT_DIRECTORY SDK_DIRECTORY")
    build = pathlib.Path(arguments[0])
    experiment = pathlib.Path(arguments[1])
    sdk = pathlib.Path(arguments[2])
    link_file = build / "CMakeFiles/makeshift-kernel.dir/link.txt"
    command: list[str] = shlex.split(link_file.read_text(encoding="utf8"))
    output_index = command.index("-o") + 1
    command[output_index] = str(experiment / "bin/makeshift-kernel-fork")
    command = [
        argument for argument in command
        if not argument.startswith(("-Wl,-rpath,", "-Wl,-rpath="))
    ]
    command[1:1] = [
        "-Wl,--disable-new-dtags",
        f"-Wl,-rpath,{experiment / 'lib'}:{sdk / 'lib'}",
    ]
    subprocess.run(command, cwd=build, check=True)


if __name__ == "__main__":
    main(sys.argv[1:])
