"""Preview counterpart of hologram-orbits.js; coordinates use the saved sprite plane."""
import math
from PIL import Image, ImageDraw


def point(orbit, angle):
    cx, cy = orbit['center']; rx, ry = orbit['radii']
    c, s = math.cos(orbit['tilt']), math.sin(orbit['tilt'])
    return cx + rx*math.cos(angle)*c - ry*math.sin(angle)*s, cy + rx*math.cos(angle)*s + ry*math.sin(angle)*c


def strokes(index, rings, front):
    if index is None:
        return []
    result = []
    for orbit in rings['orbits']:
        angle = orbit['offset'] + orbit['direction']*index/rings['frames']*math.tau
        alpha = .70 + .16*math.sin(angle)
        parts, points = [], []
        for n in range(21):
            a = angle - orbit['direction']*rings['arc']*(1-n/20)
            if (math.sin(a) >= 0) == front:
                points.append(point(orbit, a))
            elif points:
                parts.append(points); points = []
        if points:
            parts.append(points)
        for points in parts:
            if len(points) > 1:
                result.extend([(points, 6, alpha*.17), (points, 2.5, alpha)])
        if (math.sin(angle) >= 0) == front:
            x, y = point(orbit, angle); tx, ty = point(orbit, angle-.015)
            length = math.hypot(x-tx, y-ty); nx, ny = -(y-ty)/length*5, (x-tx)/length*5
            result.extend([([(x-nx,y-ny),(x+nx,y+ny)],2,alpha),
                           ([(x-3,y-3),(x+3,y-3),(x+3,y+3),(x-3,y+3),(x-3,y-3)],2,alpha)])
    return result


def layer(index, rings, front, size):
    image = Image.new('RGBA', size)
    draw = ImageDraw.Draw(image)
    for points, width, alpha in strokes(index, rings, front):
        draw.line([(round(x),round(y)) for x,y in points], fill=(126,244,255,round(alpha*255)), width=round(width), joint='curve')
    return image


def compose(frame, seconds, rings):
    index = int(seconds % rings['period'] / rings['period'] * rings['frames'])
    image = layer(index, rings, False, frame.size)
    image.alpha_composite(frame)
    image.alpha_composite(layer(index, rings, True, frame.size))
    return image
