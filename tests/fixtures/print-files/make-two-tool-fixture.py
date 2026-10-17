#!/usr/bin/env python
"""Create a two-tool 3mf fixture from the existing single-tool fixture.

Rewrites Metadata/slice_info.config with two <filament> entries so
slicer-meta's ThreeMfParser reports per-filament usedG/usedM for tools 0 and
1. Also updates plate_1.json and the gcode usage comments for consistency.
"""
import json
import shutil
import zipfile

SRC = 'tests/fixtures/print-files/ad5x-single-tool.3mf'
DST = 'tests/fixtures/print-files/creator5-two-tool.3mf'

TOOL_G = ['11.28', '8.64']
TOOL_M = ['3.78', '2.88']

with zipfile.ZipFile(SRC, 'r') as zin:
    entries = {name: zin.read(name) for name in zin.namelist()}

slice_info = entries['Metadata/slice_info.config'].decode('utf-8')
filament_line = (
    '    <filament id="1" tray_info_idx="GFL99" type="PLA" color="#808000" '
    f'used_m="{TOOL_M[0]}" used_g="{TOOL_G[0]}" />\n'
)
two_filaments = (
    '    <filament id="1" tray_info_idx="GFL99" type="PLA" color="#808000" '
    f'used_m="{TOOL_M[0]}" used_g="{TOOL_G[0]}" />\n'
    '    <filament id="2" tray_info_idx="GFL99" type="PLA" color="#FF0000" '
    f'used_m="{TOOL_M[1]}" used_g="{TOOL_G[1]}" />\n'
)
assert filament_line in slice_info, 'filament line not found in slice_info.config'
slice_info = slice_info.replace(filament_line, two_filaments)
entries['Metadata/slice_info.config'] = slice_info.encode('utf-8')

plate = json.loads(entries['Metadata/plate_1.json'].decode('utf-8'))
plate['filament_colors'] = ['#808000', '#FF0000']
plate['filament_ids'] = [0, 1]
entries['Metadata/plate_1.json'] = json.dumps(plate).encode('utf-8')

gcode = entries['Metadata/plate_1.gcode'].decode('utf-8')
gcode = gcode.replace('; filament_density: 1.24,1.24', '; filament_density: 1.24,1.24')
gcode = gcode.replace('; filament used [mm] = 3783.30, 0.00', '; filament used [mm] = 3783.30, 2880.00')
gcode = gcode.replace('; filament used [cm3] = 9.10, 0.00', '; filament used [cm3] = 9.10, 6.91')
gcode = gcode.replace('; filament used [g] = 11.28, 0.00', '; filament used [g] = 11.28, 8.64')
gcode = gcode.replace('; total filament used [g] = 11.28', '; total filament used [g] = 19.92')
entries['Metadata/plate_1.gcode'] = gcode.encode('utf-8')

with zipfile.ZipFile(DST, 'w', zipfile.ZIP_DEFLATED) as zout:
    for name, data in entries.items():
        zout.writestr(name, data)

print(f'wrote {DST}')
