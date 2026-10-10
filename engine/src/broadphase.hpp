#pragma once
#include "ccd.hpp"
#include <array>
#include <utility>

class BroadPhase {
  struct ShapeState {
    Vec2 position;
    double angle, width, height;
    int kind;
    bool immovable;
  };
  struct Bounds {
    size_t index;
    double minX, maxX, minY, maxY;
  };
  std::vector<Bounds> bounds;
  std::vector<std::pair<size_t, size_t>> pairs;
  std::vector<unsigned char> joined;
  std::vector<size_t> assembly;
  std::vector<std::array<int, 3>> topology;
  std::vector<ShapeState> shapes;
  bool boundsValid = false;
  void collectPairs(const std::vector<Body> &bodies);

public:
  void prepare(const std::vector<Body> &bodies, const std::vector<Link> &links);
  const std::vector<std::pair<size_t, size_t>> &update(const std::vector<Body> &bodies);
  const std::vector<std::pair<size_t, size_t>> &sweep(
      const std::vector<Body> &bodies, const std::vector<BodySweep> &motion);
  const std::vector<std::pair<size_t, size_t>> &candidates() const { return pairs; }
};
