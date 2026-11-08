# SPDX-License-Identifier: Apache-2.0
# OneEuro adapted from mousepods (Copyright 2026 Matteo Gaudioso, starman-tech).
"""Smoothing for head angles."""

import math


class OneEuro:
    """One Euro filter (Casiez et al.): smooth when still, low lag when moving.

    mincutoff (Hz): lower = smoother at rest. beta: higher = less lag on fast moves.
    """

    def __init__(self, mincutoff=1.5, beta=0.05, dcutoff=1.0):
        self.mincutoff, self.beta, self.dcutoff = mincutoff, beta, dcutoff
        self.x = self.dx = None

    @staticmethod
    def _a(cutoff, dt):
        return 1.0 / (1.0 + 1.0 / (2 * math.pi * cutoff * dt))

    def __call__(self, x, dt):
        if self.x is None or dt <= 0:
            self.x, self.dx = x, 0.0
            return x
        dx = (x - self.x) / dt
        self.dx += self._a(self.dcutoff, dt) * (dx - self.dx)
        self.x += self._a(self.mincutoff + self.beta * abs(self.dx), dt) * (x - self.x)
        return self.x

    def reset(self, x=None):
        self.x, self.dx = x, (0.0 if x is not None else None)
