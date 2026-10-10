#pragma once
#include "body.hpp"

struct BodySweep {
  Vec2 translation{};
  double rotation = 0;
};

struct ImpactTime {
  double fraction = 1;
  bool hit = false;
  bool converged = true;
};

constexpr double CcdDistance = 1e-7;
constexpr double PositionTolerance = 1e-5;
double separatingDistance(const Body &a, const Body &b, Vec2 &normal);
ImpactTime timeOfImpact(const Body &a, const BodySweep &sweepA,
                        const Body &b, const BodySweep &sweepB, bool limitOverlap = false);
