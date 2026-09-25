#pragma once
#include "body.hpp"

struct RestState {
  Vec2 position, velocity;
  double angle, angularVelocity;
};

void stabilizeRest(Body &body, const RestState &before, double dt, bool dragged);
