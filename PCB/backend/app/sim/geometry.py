from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

from .rules import CourtRules


Vec2 = Tuple[float, float]


@dataclass(frozen=True)
class CourtGeom:
    rules: CourtRules

    @property
    def L(self) -> float:
        return float(self.rules.length_m)

    @property
    def W(self) -> float:
        return float(self.rules.width_m)

    def clamp_in_bounds(self, p: Vec2, margin: float = 0.15) -> Vec2:
        x, y = p
        return (
            max(margin, min(self.L - margin, x)),
            max(margin, min(self.W - margin, y)),
        )

    def rim(self, attack_right: bool) -> Vec2:
        x = self.L - float(self.rules.rim_x_from_baseline_m) if attack_right else float(self.rules.rim_x_from_baseline_m)
        return (x, self.W / 2.0)

    def is_three(self, p: Vec2, attack_right: bool) -> bool:
        # Approx: arc + corner threshold.
        rim_x, rim_y = self.rim(attack_right)
        dx = p[0] - rim_x
        dy = p[1] - rim_y
        dist = math.hypot(dx, dy)
        if dist >= float(self.rules.three_arc_radius_m):
            return True
        # Corners: distance to baseline side beyond corner distance (simplified)
        # Treat the "corner" as when the x is close to baseline and y is outside lane bands.
        corner_dist = float(self.rules.three_corner_distance_m)
        if attack_right:
            if p[0] >= self.L - corner_dist and (p[1] <= 2.0 or p[1] >= self.W - 2.0):
                return True
        else:
            if p[0] <= corner_dist and (p[1] <= 2.0 or p[1] >= self.W - 2.0):
                return True
        return False

    def in_paint(self, p: Vec2, attack_right: bool) -> bool:
        # Simplified paint rectangle around rim side.
        rim_x, _ = self.rim(attack_right)
        depth = 5.8
        left = rim_x - depth if attack_right else rim_x
        right = rim_x if attack_right else rim_x + depth
        y0 = (self.W / 2.0) - 2.45
        y1 = (self.W / 2.0) + 2.45
        return left <= p[0] <= right and y0 <= p[1] <= y1


def dist(a: Vec2, b: Vec2) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def add(a: Vec2, b: Vec2) -> Vec2:
    return (a[0] + b[0], a[1] + b[1])


def sub(a: Vec2, b: Vec2) -> Vec2:
    return (a[0] - b[0], a[1] - b[1])


def mul(a: Vec2, s: float) -> Vec2:
    return (a[0] * s, a[1] * s)


def norm(a: Vec2) -> Vec2:
    d = math.hypot(a[0], a[1])
    if d <= 1e-9:
        return (0.0, 0.0)
    return (a[0] / d, a[1] / d)

