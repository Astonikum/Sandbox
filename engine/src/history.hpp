#pragma once
#include "body.hpp"
#include "protocol.hpp"
#include <array>

class StateHistory {
  using Frame = std::array<double, protocol::MaxBodies * protocol::StateStride>;
  std::array<Frame, protocol::HistorySize> frames{};

public:
  void record(int tickIndex, const std::vector<Body> &bodies);
  int sample(double time, int tickIndex, size_t bodyCount, double *output) const;
};
