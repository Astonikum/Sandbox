#pragma once
#include <algorithm>
#include <cmath>

struct Vec2 {
  double x = 0, y = 0;
  Vec2 operator+(Vec2 b) const { return {x + b.x, y + b.y}; }
  Vec2 operator-(Vec2 b) const { return {x - b.x, y - b.y}; }
  Vec2 operator*(double s) const { return {x * s, y * s}; }
};
inline double dot(Vec2 a, Vec2 b) { return a.x * b.x + a.y * b.y; }
inline double cross(Vec2 a, Vec2 b) { return a.x * b.y - a.y * b.x; }
inline double length(Vec2 a) { return std::sqrt(dot(a, a)); }
inline Vec2 normalized(Vec2 a) { return a * (1 / std::max(length(a), 1e-10)); }
inline Vec2 rotated(Vec2 a, double r) {
  return {a.x * cos(r) - a.y * sin(r), a.x * sin(r) + a.y * cos(r)};
}
inline Vec2 perpendicular(Vec2 a) { return {-a.y, a.x}; }
