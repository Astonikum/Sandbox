#pragma once
#include "broadphase.hpp"
#include "collision.hpp"
#include "rest.hpp"

class Solver {
  BroadPhase broadPhase;
  ContactSolver contacts;
  std::vector<RestState> previous;

public:
  void reset() { contacts.clear(); }
  void step(std::vector<Body> &bodies, const std::vector<Link> &links,
            const std::vector<Vec2> &forces, double gravity, double dt, int draggedBody,
            Vec2 target, Vec2 localGrab = {});
};
