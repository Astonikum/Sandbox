#pragma once
#include "body.hpp"
#include <utility>

class BroadPhase {
  struct Bounds {
    size_t index;
    double minX, maxX, minY, maxY;
  };
  std::vector<Bounds> bounds;
  std::vector<std::pair<size_t, size_t>> pairs;
  std::vector<unsigned char> joined;

public:
  void prepare(const std::vector<Body> &bodies, const std::vector<Link> &links);
  const std::vector<std::pair<size_t, size_t>> &update(const std::vector<Body> &bodies);
  const std::vector<std::pair<size_t, size_t>> &candidates() const { return pairs; }
};
