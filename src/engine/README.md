# Game engine

Framework-independent simulation systems live here. No engine module may import
React, Zustand, Tauri, or UI/application modules. Simulation code must use a
seed-driven `RandomSource`.
